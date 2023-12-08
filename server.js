const express = require('express');
const bodyParser = require('body-parser');
const jwt = require('jsonwebtoken');
const mysql = require('mysql2/promise');
const app = express();
const PORT = process.env.PORT || 3000;
const SECRET_KEY = 'your_secret_key';
// Create a MySQL connection pool
const pool = mysql.createPool({
    host: 'mysql-345a31db-gwagsiglenn-2dc5.a.aivencloud.com',
    user: 'avnadmin',
    password: 'AVNS_dp0kebw2QQaHD88ZuvK',
    database: 'defaultdb',
    port: 27638,
    waitForConnections: true,
    connectionLimit: 90,
    queueLimit: 0
});

// Middleware to parse JSON in request body
app.use(bodyParser.json());

// Initialize database schema
async function initializeDatabase() {
    try {
        const connection = await pool.getConnection();
//console.log('connection', connection);
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
        console.log('connection release'  );
    } catch (error) {
        console.error('Error initializing database:', error);
    }
}

// Initialize the database schema


// Initialize the database schema
initializeDatabase();


app.post('/wallets/signin', async (req, res) => {
    const { phone, password } = req.body;
    console.log('phone', phone);
    console.log('password', password);

    try {
        // Get a connection from the pool
        const connection = await pool.getConnection();
        console.log('connection GOTTEN', );

        // Check if the user with the provided email exists
        const [userResult] = await connection.execute('SELECT * FROM users WHERE phone = ?', [phone]);
console.log('userResult', userResult);   
        if (!userResult || userResult.length === 0) {
            connection.release();
            return res.status(401).json({ message: 'Invalid email or password' });
        }

        const user = userResult[0];

       
        if (password !== user.password) {
            connection.release();
            return res.status(401).json({ message: 'Invalid phone or password' });
        }

        // Generate a JWT token
        const token = jwt.sign({ user_id: user.id }, SECRET_KEY, { expiresIn: '1h' });

        // Release the connection back to the pool
        connection.release();

        // Send the token in the response
        res.json({ phone: user.phone, token:token,wallet:user.wallet,user_id:user.id });
    } catch (error) {
        console.error("this is the err ",error);
        // Release the connection back to the pool in case of an error
        connection.release();
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// Endpoint to sign up
app.post('/wallets/signup', async (req, res) => {
    const { phone, password } = req.body;
    const wallet = (Math.floor(Math.random() * 10000000) / 100).toFixed(2);

    

    try {
        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Insert user data into the database
        const [result] = await connection.execute('INSERT INTO users (phone, password, wallet) VALUES (?, ?, ?)', [phone, password, wallet]);
        const [userResult] = await connection.execute('SELECT * FROM users WHERE phone = ?', [phone]);
        const user = userResult[0];
        // Release the connection back to the pool
        connection.release();
        const token = jwt.sign({ user_id: user.id }, SECRET_KEY, { expiresIn: '1h' });
        res.json({ phone:phone, wallet:wallet ,token: token,user_id:user.id });
    } catch (error) {
        console.error(error);
        res.status(500).json({ message: 'Error creating user' });
    }
});
// Middleware to authenticate requests
app.use(async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) {
        return res.status(401).json({ message: 'Unauthorized' });
    }

    jwt.verify(token.replace('Bearer ', ''), SECRET_KEY, (err, decoded) => {
        if (err) {
            return res.status(401).json({ message: 'Invalid token' });
        }
        req.user = decoded;
        next();
    });
});

// Endpoint to fund wallet
app.post('/wallets/fund-wallet', async (req, res) => {
    const { amount, recipient } = req.body;
    const transactionFee = amount * 0.038;
    const totalAmount = amount + transactionFee;

    try {
        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Start a transaction with MySQL
        await connection.beginTransaction();

        // Get the recipient's user ID based on their phone number
        const [recipientResult] = await connection.execute('SELECT id FROM users WHERE phone = ?', [recipient]);

        if (!recipientResult || recipientResult.length === 0) {
            // Rollback the transaction if the recipient doesn't exist
            await connection.rollback();
            connection.release();
            return res.status(400).json({ message: 'Recipient not found' });
        }

        const recipientId = recipientResult[0].id;

        // Get the current balance of the sender
        const [senderBalanceResult] = await connection.execute('SELECT wallet FROM users WHERE id = ?', [req.user.user_id]);

        if (!senderBalanceResult || senderBalanceResult.length === 0) {
            // Rollback the transaction if the sender doesn't exist
            await connection.rollback();
            connection.release();
            return res.status(400).json({ message: 'Sender not found' });
        }

        const senderBalance = parseFloat(senderBalanceResult[0].wallet);

        // Check if the sender has enough balance
        if (senderBalance < totalAmount) {
            // Rollback the transaction if the sender has insufficient balance
            await connection.rollback();
            connection.release();
            return res.status(400).json({ message: 'Insufficient balance' });
        }

        // Update the sender's balance
        await connection.execute('UPDATE users SET wallet = ? WHERE id = ?', [(senderBalance - totalAmount).toFixed(2), req.user.user_id]);

        // Update the recipient's balance (for demonstration purposes)
        await connection.execute('UPDATE users SET wallet = wallet + ? WHERE id = ?', [amount.toFixed(2), recipientId]);

        // Process payment (dummy logic for illustration)
        // Assume payment is successful and update user balance
        await connection.execute('INSERT INTO transactions (sender_id, recipient_id, trans_type, amount, details) VALUES (?, ?, ?, ?, ?)',
            [req.user.user_id, recipientId, 'fund_wallet', totalAmount.toFixed(2), 'Fund Wallet']);

        // Commit the transaction
        await connection.commit();

        // Release the connection back to the pool
        connection.release();

        res.json({ message: 'Wallet Funded', balance: (senderBalance - totalAmount).toFixed(2) });
    } catch (error) {
        console.error(error);
        // Rollback the transaction in case of an error
        await connection.rollback();
        // Release the connection back to the pool
        connection.release();
        return res.status(500).json({ message: 'Error processing payment' });
    }
});
app.post('/wallets/add-money', async (req, res) => {
    // Extract the amount from the request body
    const { balance } = req.body;
    const {message} = req.body;
    console.log('balance', balance);
    const amount = parseFloat(balance);

    try {
        // Get a connection from the pool
        const connection = await pool.getConnection();

        // Start a transaction with MySQL
        await connection.beginTransaction();

        // Get the current balance of the user
        const [userBalanceResult] = await connection.execute('SELECT wallet FROM users WHERE id = ?', [req.user.user_id]);

        if (!userBalanceResult  ) {
            // Rollback the transaction if the user doesn't exist
            await connection.rollback();
            connection.release();
            return res.status(400).json({ message: 'User not found' });
        }

        const currentBalance = parseFloat(userBalanceResult[0].wallet);
        console.log('about to User wallet updated', currentBalance);
        console.log('about to User wallet updated', amount);
        // Update the user's balance
        await connection.execute('UPDATE users SET wallet = ? WHERE id = ?', [(currentBalance + amount).toFixed(2), req.user.user_id]);
console.log('User wallet updated', currentBalance);
        // Process the transaction (dummy logic for illustration)
        await connection.execute('INSERT INTO transactions (sender_id,recipient_id, trans_type, amount, details) VALUES (?, ?, ?, ?,?)',
            [req.user.user_id,req.user.user_id, 'add_money', amount.toFixed(2), message]);

        // Commit the transaction
        await connection.commit();

        // Release the connection back to the pool
        connection.release();

        res.json({ message: 'Money added to the wallet', balance: (currentBalance + amount).toFixed(2) });
    } catch (error) {
        console.error(error);
        // Rollback the transaction in case of an error
        await connection.rollback();
        // Release the connection back to the pool
        connection.release();
        return res.status(500).json({ message: 'Error adding money to the wallet' });
    }
});


// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});