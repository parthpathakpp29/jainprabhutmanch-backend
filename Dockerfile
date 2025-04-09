# Use Node.js base image
FROM node:18

# Create app directory
WORKDIR /app

# Install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Expose your app por
EXPOSE 4000

# Start the app
CMD ["npm", "run", "start"]
