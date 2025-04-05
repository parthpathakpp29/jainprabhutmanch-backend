FROM node:22-alpine
# Set working directory
WORKDIR /usr/src/app
# Copy package files first (for better caching)
COPY package*.json ./

RUN npm install

COPY ..

# Expose the port your app runs on
EXPOSE 4000

# Command to run the application
CMD ["npm", "run dev"]