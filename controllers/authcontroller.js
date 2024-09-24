const bcrypt = require('bcrypt');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { PrismaClient } = require('@prisma/client');
const sendEmailWithOTP = require('../utils/emailservice');

const prisma = new PrismaClient();

const OTP_EXPIRY_TIME = 30 * 1000; // 30 seconds

const register = async (req, res) => {
    try {
        const { f_name, l_name, email, password, phone_no, address } = req.body;

        // Check if the user already exists in the database
        const existingCustomer = await prisma.Customer.findUnique({
            where: { email },
        });

        if (existingCustomer) {
            if (existingCustomer.isVerified) {
                // If the user is already registered and verified
                return res.status(400).json({ message: 'Email is already registered and verified.' });
            } else {
                // If the user is registered but not verified, resend OTP
                const otp = Math.floor(100000 + Math.random() * 900000); // Generate new OTP
                const token = jwt.sign({ id: existingCustomer.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
                // Update OTP and resend verification email
                await prisma.Customer.update({
                    where: { email },
                    data: { otp, createdAt: new Date() }, // Update OTP and timestamp
                });

                console.log("Customer is not verified, resending OTP...");
                await sendEmailWithOTP(existingCustomer.email, "Email Verification OTP", `Your OTP for email verification is ${otp}`);
                console.log("OTP resent");

                return res.status(400).json({ message: 'Email already registered but not verified. OTP resent for email verification.',email:existingCustomer.email,token:token });
            }
        }

        // If the customer is new, proceed with registration
        const hashedPassword = await bcrypt.hash(password, 10); // Hash the password

        // Generate a new OTP
        const otp = Math.floor(100000 + Math.random() * 900000);

        // Create new customer entry in the database
        const customer = await prisma.Customer.create({
            data: {
                first_name: f_name,
                last_name: l_name,
                email: email,
                password: hashedPassword,
                phone_no: phone_no,
                address: address,
                otp: otp,
                isVerified: false, // Not verified initially
                createdAt: new Date(), // Track OTP creation time
            },
        });

        console.log("New customer registered, sending OTP...");
        await sendEmailWithOTP(customer.email, "Email Verification OTP", `Your OTP for email verification is ${otp}`);
        console.log("OTP sent");

        // Generate JWT token
        const token = jwt.sign({ id: customer.id }, process.env.JWT_SECRET, { expiresIn: '1h' });

        res.status(201).json({
            message: 'Customer registered successfully. OTP sent for email verification.',
            customerId: customer.id,
            token: token
        });

    } catch (error) {
        console.error('Error registering customer:', error);
        res.status(500).json({ message: 'Error registering customer', error });
    }
};


const verifyEmailWithOTP = async (req, res) => {
    try {
        const { email, otp } = req.body;
        const customer = await prisma.Customer.findUnique({ where: { email } });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Check if the OTP is valid and not expired
        if (customer.otp === parseInt(otp)) {
            if (Date.now() - customer.createdAt.getTime() <= OTP_EXPIRY_TIME) {
                await prisma.Customer.update({
                    where: { email },
                    data: { isVerified: true, otp: null }, // Clear OTP after successful verification
                });

                return res.status(200).json({ message: 'Email verified successfully', customerId: customer.id });
            } else {
                return res.status(400).json({ message: 'OTP has expired. Please request a new one.' });
            }
        } else {
            res.status(400).json({ message: 'Invalid OTP' });
        }
    } catch (error) {
        console.error('Error verifying OTP:', error);
        res.status(500).json({ message: 'Error verifying OTP', error });
    }
};

const resendOTP = async (req, res) => {
    try {
        const { email } = req.body;
        const customer = await prisma.customer.findUnique({ where: { email } });
        console.log("Inside Resend OTP")
        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Check if 30 seconds have passed since the last OTP was sent
        if (Date.now() - customer.createdAt.getTime() <= OTP_EXPIRY_TIME) {
            return res.status(400).json({ message: 'Please wait before requesting a new OTP.' });
        }

        // Generate a new OTP
        const newOtp = Math.floor(100000 + Math.random() * 900000);

        await prisma.customer.update({
            where: { email },
            data: {
                otp: newOtp,
                createdAt: new Date(), // Update the time of OTP generation
            },
        });

        await sendEmailWithOTP(customer.email, "Email Verification OTP", newOtp);
        res.status(200).json({ message: 'New OTP sent successfully' });
        
    } catch (error) {
        console.error('Error resending OTP:', error);
        res.status(500).json({ message: 'Error resending OTP', error });
    }
};


const login = async (req, res) => {
    try {
        const { email, password } = req.body;
        const customer = await prisma.Customer.findUnique({ where: { email } });

        if (!customer || !await bcrypt.compare(password, customer.password)) {
            return res.status(401).json({ message: 'Invalid credentials' });
        }

        if (!customer.isVerified) {
            return res.status(403).json({ message: 'Please verify your email before logging in.' });
        }

        const token = jwt.sign({ id: customer.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
        res.json({ token });
    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ message: 'Error logging in', error });
    }
};
// Status check endpoint to see if the customer is already registered and verified
const checkStatus = async (req, res) => {
    try {
        const { email } = req.body;
        const customer = await prisma.Customer.findUnique({ where: { email } });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found', isRegistered: false });
        }

        if (customer.isVerified) {
            return res.status(200).json({ message: 'Customer already registered and verified', isRegistered: true, isVerified: true });
        } else {
            return res.status(200).json({ message: 'Customer already registered but not verified', isRegistered: true, isVerified: false });
        }
    } catch (error) {
        console.error('Error checking customer status:', error);
        res.status(500).json({ message: 'Error checking status', error });
    }
};



const forgotPassword = async (req, res) => {
    try {
        const { email } = req.body;
        const customer = await prisma.Customer.findUnique({ where: { email } });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        // Generate a reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        const resetTokenExpiry = new Date(Date.now() + 3600000); // Token valid for 1 hour

        await prisma.Customer.update({
            where: { email },
            data: {
                resetToken: resetToken,
                resetTokenExpiry: resetTokenExpiry,
            },
        });

        // Send password reset email
        const resetUrl = `${process.env.CLIENT_URL}/reset-password?token=${resetToken}&email=${email}`;
        await sendEmailWithOTP(customer.email, "Password Reset", `Click the following link to reset your password: ${resetUrl}`);

        res.status(200).json({ message: 'Password reset email sent' });

    } catch (error) {
        console.error('Error sending password reset email:', error);
        res.status(500).json({ message: 'Error sending password reset email', error });
    }
};
const resetPassword = async (req, res) => {
    try {
        const { email, token, newPassword } = req.body;

        const customer = await prisma.Customer.findUnique({ where: { email } });

        if (!customer) {
            return res.status(404).json({ message: 'Customer not found' });
        }

        if (customer.resetToken !== token || new Date() > customer.resetTokenExpiry) {
            return res.status(400).json({ message: 'Invalid or expired token' });
        }

        // Hash the new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password and clear resetToken/resetTokenExpiry
        await prisma.Customer.update({
            where: { email },
            data: {
                password: hashedPassword,
                resetToken: null,
                resetTokenExpiry: null,
            },
        });

        res.status(200).json({ message: 'Password reset successfully' });

    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ message: 'Error resetting password', error });
    }
};

module.exports={register,login,verifyEmailWithOTP,resendOTP,forgotPassword,resetPassword,checkStatus};
