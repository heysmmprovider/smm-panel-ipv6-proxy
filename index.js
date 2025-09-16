require("dotenv").config();
const ProxyClass = require("./src/classes/ProxyClass");
const wssTunneling = new ProxyClass({ appName: require('./package.json').name });

wssTunneling.proxyServer.listen(process.env.PROXY_PORT || 8080, () => 
    console.log("🌐 Proxy server is listening on port:", process.env.PROXY_PORT || 8080)
);

wssTunneling.http.listen(process.env.WS_PORT || 3000, () => 
    console.log("🌐 WS proxy is listening on port:", process.env.WS_PORT || 3000)
);

console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🚀 SMM Panel IPv6 Proxy Server Running
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🌐 HeySMMReseller.com - The SMM Provider with Real Support
💼 Need IPv6 Subnets? Visit https://heysmmreseller.com
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
`);