const proxyEvents = {
    CREATE_CONNECTION: "proxy:create-connection",
    CONNECTED: "proxy:connected",
    REQUEST: "proxy:request",
    CLIENT_DATA: "proxy:client-data",
    SERVER_DATA: "proxy:server-data",
    CONNECTION_ERROR: "proxy:connection-error",
    GET_SERVER_IP: "proxy:get-server-ip"
};

const { Server } = require('socket.io');
const net = require('net');
const url = require("url");
const httpParser = require('http-string-parser');
const { randomUUID } = require('crypto');
const express = require('express');

class ProxyClass {
    constructor({ appName }) {
        this.io = new Server({
            transports: ['websocket'],
            cors: { origin: '*' },
            requestCert: true,
            rejectUnauthorized: false,
            pingInterval: 10000,
            pingTimeout: 60000
        });
        this.tcpSockets = new Map();
        this.connectedClients = new Map();
        this.app = express();
        this.serverIps = new Map();
        this.ipv6TunnelServer = '';
        this.proxyServer = net.createServer();
        this.http = require('http').createServer();
        
        // Simple startup log instead of appStartingReporter
        if (!process.env.DEBUG_MODE) {
            console.log(`[${new Date().toISOString()}] ${appName} starting...`);
        }
        
        this.initialize();
    }
    
    initialize() {
        this.io.attach(this.http);
        this.io.on('error', (e) => console.warn(e, 'io'));
        this.wssOnConnectionEvent();
        this.proxyOnConnectionEvent();
    }
    
    isValidIPv6Address(ipv6Address) {
        // TODO: Implement proper IPv6 validation
        // For now, returns true to allow all addresses
        // You can enhance this with proper subnet checking
        return true;
    }
    
    getServerName(ipv6Address) {
        return this.ipv6TunnelServer;
        // return 'vultr.guest';
    }
    
    handleConnectionError(tcpSocket, message) {
        console.log('handleConnectionError:', message);
        return tcpSocket.write(Buffer.from(
            'HTTP/1.1 407 Proxy Authentication Required\n' + 
            `Date: ${new Date()}\n` + 
            `Proxy-Authenticate: Basic realm='${message}'\n\n` + 
            'Unauthorized 407'
        ));
    }
    
    proxyOnConnectionEvent() {
        this.proxyServer.on('connection', (tcpSocket) => {
            setTimeout(() => { tcpSocket.end() }, 100000);
            const correlationId = randomUUID();
            
            tcpSocket.on('error', () => {
                if (this.tcpSockets.has(correlationId)) this.tcpSockets.delete(correlationId);
                else console.log('tcpSocket has been ended', correlationId);
            });
            
            tcpSocket.on('close', () => {
                if (this.tcpSockets.has(correlationId)) this.tcpSockets.delete(correlationId);
            });
            
            tcpSocket.on('end', () => {
                if (this.tcpSockets.has(correlationId)) this.tcpSockets.delete(correlationId);
            });
            
            tcpSocket.once('data', async (data) => {
                this.tcpSockets.set(correlationId, tcpSocket);
                const { method, uri, headers } = httpParser.parseRequest(data.toString());
                const authHeader = headers['Proxy-Authorization'];
                
                if (!authHeader) return this.handleConnectionError(tcpSocket, 'Please provide authentication!');
                
                const [, credentialsEncoded] = authHeader?.split(' ');
                const buff = Buffer.from(credentialsEncoded, 'base64');
                const ipv6Address = buff.toString('ascii');
                const isTLS = method === 'CONNECT';
                
                if (!ipv6Address) return this.handleConnectionError(tcpSocket, 'IPv6 address is incorrect!');
                
                if (!this.isValidIPv6Address(ipv6Address)) {
                    console.log('unable to find ipv6Address', ipv6Address);
                    return this.handleConnectionError(tcpSocket, 'IP address is not available');
                }
                
                const socketConnection = this.connectedClients.get(this.getServerName(ipv6Address));
                
                tcpSocket.on('data', (chunk) => {
                    socketConnection ? socketConnection?.emit(proxyEvents.CLIENT_DATA, { correlationId, chunk }) : null
                });
                
                const { host, port } = url.parse(`${isTLS ? 'https://' : ''}${uri}`);
                
                socketConnection ? socketConnection?.emit(isTLS ? proxyEvents.CREATE_CONNECTION : proxyEvents.REQUEST, {
                    correlationId,
                    data: isTLS ? null : data,
                    host: isTLS ? host.replace(':443', '') : host,
                    port: isTLS ? 443 : parseInt(port || '80'),
                    ipv6Address
                }) : null;
            });
        });
        
        this.proxyServer.on('error', (e) => console.warn(e, 'proxy_server'));
    }
    
    wssOnConnectionEvent() {
        this.io.on('connection', async (socket) => {
            try {
                const serverName = socket.request.headers['server-name'];
                console.log('connected server:', serverName);
                this.ipv6TunnelServer = serverName;
                this.connectedClients.set(serverName, socket);
                
                socket.on('heartbeat', (data) => {
                    console.log(`Heartbeat received from client ${socket.id} at ${new Date(data.time)}`);
                    socket.emit('heartbeat_ack', { time: Date.now() }); // Acknowledge the heartbeat
                });
                
                socket.on(proxyEvents.SERVER_DATA, async ({ correlationId, chunk }) => {
                    if (!this.tcpSockets.has(correlationId)) return;
                    else this.tcpSockets.get(correlationId).write(chunk);
                });
                
                socket.on(proxyEvents.CONNECTED, ({ correlationId }) => {
                    if (!this.tcpSockets.has(correlationId)) return;
                    const tcpSocket = this.tcpSockets.get(correlationId);
                    tcpSocket.write('HTTP/1.1 200 OK\r\n\r\n', 'utf-8');
                });
                
                socket.on('error', (e) => console.warn(e, 'socket_error_ws'));
                
                socket.on(proxyEvents.CONNECTION_ERROR, ({ correlationId, error }) => {
                    if (this.tcpSockets.has(correlationId)) {
                        const tcpSocket = this.tcpSockets.get(correlationId);
                        console.log('proxyEvents.CONNECTION_ERROR', error);
                        tcpSocket.end(`HTTP/1.1 500 Internal Server Error\r\nContent-Type: text/plain\r\n\r\n${error}\r\n`);
                        this.tcpSockets.delete(correlationId);
                    }
                });
                
                socket.on('disconnect', () => {
                    console.log('disconnected server:', serverName);
                    // this.connectedClients.delete(serverName);
                });
            } catch (error) {
                console.warn(error, 'ws_error');
            }
        });
    }
}

module.exports = ProxyClass;