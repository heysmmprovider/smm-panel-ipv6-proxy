# Use the official lightweight Node.js 16 image.
FROM --platform=linux/amd64 node:20.11.1-slim

# Set the working directory
WORKDIR /usr/src/app

# Install git
RUN apt-get update && apt-get install -y git nano curl

# Copy package.json and package-lock.json
COPY ./package*.json /usr/src/app

# Install app dependencies
RUN npm install

# Copy the rest of your app's source code
COPY ./ /usr/src/app

# Override the default command to keep the container running
CMD ["node", "index.js"]
# CMD ["tail", "-f", "/dev/null"]