# Dockerfile for Render.com with ffmpeg and yt-dlp
FROM node:18-slim

# Install ffmpeg and dependencies for yt-dlp
RUN apt-get update && apt-get install -y \
    ffmpeg \
    python3 \
    python3-pip \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Install yt-dlp
RUN pip3 install yt-dlp

# Create app directory
WORKDIR /app

# Copy package files
COPY server/package*.json ./

# Install Node dependencies
RUN npm install

# Copy server code
COPY server/ ./

# Expose port (Render uses 10000 by default)
EXPOSE 10000

# Start the server
CMD ["npm", "start"]
