const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const sendEmail = require('../utils/emailservice');
const authenticateJWT=require('../middleware/authMiddleware'); // Import your existing email service

const prisma = new PrismaClient();
const router = express.Router();

// Register admin
router.post('/register', async (req, res) => {
    const { name, email, password } = req.body;

    try {
        const existingAdmin = await prisma.admin.findUnique({ where: { email } });
        if (existingAdmin) {
            return res.status(400).json({ message: 'Admin already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const admin = await prisma.admin.create({
            data: { name, email, password: hashedPassword },
        });

        res.status(201).json({ message: 'Admin registered successfully', admin });
    } catch (error) {
        console.error('Error registering admin:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Admin login
router.post('/login', async (req, res) => {
    const { email, password } = req.body;

    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, admin.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid email or password' });
        }

        const token = jwt.sign({ adminId: admin.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(200).json({ message: 'Login successful', token });
    } catch (error) {
        console.error('Error logging in admin:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Forgot password
router.post('/forgot-password', async (req, res) => {
    const { email } = req.body;

    try {
        const admin = await prisma.admin.findUnique({ where: { email } });
        if (!admin) {
            return res.status(400).json({ message: 'Admin with this email does not exist' });
        }

        const token = jwt.sign({ adminId: admin.id, email: admin.email }, process.env.JWT_SECRET, { expiresIn: '1h' });

        const resetUrl = `http://localhost:3000/reset-password?token=${token}&email=${admin.email}`;
        const emailSubject = 'Password Reset Request';
        const emailText = `You requested a password reset. Please use the following link to reset your password: ${resetUrl}`;

        // Use your email service to send the reset email
        await sendEmail(admin.email, emailSubject, emailText);

        res.status(200).json({ message: 'Password reset email sent successfully' });
    } catch (error) {
        console.error('Error sending password reset email:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

// Reset password
router.post('/reset-password', async (req, res) => {
    const { email,  newPassword } = req.body;

    try {
        //const decoded = jwt.verify(token, process.env.JWT_SECRET);
        // if (decoded.email !== email) {
        //     return res.status(400).json({ message: 'Invalid token or email' });
        // }

        const hashedPassword = await bcrypt.hash(newPassword, 10);

        await prisma.admin.update({
            where: { email },
            data: { password: hashedPassword },
        });

        res.status(200).json({ message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Internal server error' });
    }
});

module.exports = router;
