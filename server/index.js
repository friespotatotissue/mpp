const Server = require('./Server.js');

// Use Railway's PORT environment variable or fallback to 8080
const PORT = process.env.PORT || 8080;

// Initialize server
const server = new Server();

// Update the listen call to use Railway's PORT
server.server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
