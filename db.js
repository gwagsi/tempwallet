 

// Create a MySQL connection pool
const pool = mysql.createPool({
    host: 'your_mysql_host',
    user: 'your_mysql_user',
    password: 'your_mysql_password',
    database: 'your_mysql_database',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Middleware to parse JSON in request body
app.use(bodyParser.json());

// Initialize database schema
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();

        // Create a users table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS users (
                id INT AUTO_INCREMENT PRIMARY KEY,
                phone VARCHAR(255) NOT NULL,
                password VARCHAR(255) NOT NULL,
                wallet DECIMAL(10, 2) NOT NULL
            )
        `);

        // Create a transactions table if it doesn't exist
        await connection.execute(`
            CREATE TABLE IF NOT EXISTS transactions (
                id INT AUTO_INCREMENT PRIMARY KEY,
                sender_id INT NOT NULL,
                recipient_id INT NOT NULL,
                trans_type VARCHAR(255) NOT NULL,
                amount DECIMAL(10, 2) NOT NULL,
                details TEXT,
                time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (sender_id) REFERENCES users(id),
                FOREIGN KEY (recipient_id) REFERENCES users(id)
            )
        `);

        // Release the connection back to the pool
        connection.release();
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Initialize the database schema
