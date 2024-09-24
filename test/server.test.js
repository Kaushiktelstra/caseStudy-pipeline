const request = require('supertest');
const app = require('../app.js'); 
const { PrismaClient } = require('@prisma/client');
const path = require('path');
const fs = require('fs');

const prisma = new PrismaClient();

describe('API Endpoints', () => {

    // Clean up the database after all tests
    afterAll(async () => {
        await prisma.document.deleteMany(); // Delete documents first
        await prisma.service.deleteMany();  // Then delete services
        await prisma.customer.deleteMany(); // Delete customers
        await prisma.admin.deleteMany();    // Clean up admins
        await prisma.$disconnect();

        //Clean up uploaded files (if needed)
        // const uploadDir = path.join(__dirname, 'uploads');
        // if (fs.existsSync(uploadDir)) {
        //     fs.rmdirSync(uploadDir, { recursive: true });
        // }
    });

    let customerId, serviceId, adminId;
    const adminEmail = 'admin@example.com';
    const adminPassword = 'Admin@1234';
    let customerEmail = 'kaushikaushik223@gmail.com';
    const OTP_EXPIRY_TIME = 30000; //30 seconds 

    // Admin API Tests
    describe('Admin API Endpoints', () => {
        test('Register a new admin', async () => {
            const res = await request(app)
                .post('/admin/register')
                .send({
                    name: 'Admin User',
                    email: adminEmail,
                    password: adminPassword,
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('admin');
            expect(res.body.admin).toHaveProperty('id');
            adminId = res.body.admin.id;
        });

        test('Attempt to register the same admin again', async () => {
            const res = await request(app)
                .post('/admin/register')
                .send({
                    name: 'Admin User',
                    email: adminEmail,
                    password: adminPassword,
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Admin already exists');
        });

        test('Login with the registered admin', async () => {
            const res = await request(app)
                .post('/admin/login')
                .send({
                    email: adminEmail,
                    password: adminPassword,
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
            authToken = res.body.token;
        });

        test('Login with incorrect password', async () => {
            const res = await request(app)
                .post('/admin/login')
                .send({
                    email: adminEmail,
                    password: 'WrongPassword',
                });

            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Invalid email or password');
        });
    });

    // Customer and Service API Tests
    describe('Customer and Service API Endpoints', () => {
        test('Register a new customer', async () => {
            const res = await request(app)
                .post('/auth/register')
                .send({
                    f_name: 'Kaushik',
                    l_name: 'Naik',
                    email: 'kaushikaushik223@gmail.com',
                    password: 'Kaushik@9876',
                    phone_no: '1234567890',
                    address: 'Udupi',
                });

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('customerId');
            customerId = res.body.customerId;
            token=res.body.token;
        });

        test('Verify email with OTP', async () => {
            const customer = await prisma.customer.findUnique({ where: { id: customerId } });

            const res = await request(app)
                .post('/auth/verify-email')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    email: customer.email,
                    otp: customer.otp,
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Email verified successfully');
        });

        test('Login with verified credentials', async () => {
            const res = await request(app)
                .post('/auth/login')
                .send({
                    email: 'kaushikaushik223@gmail.com',
                    password: 'Kaushik@9876',
                });

            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('token');
        });


        // Document Upload and Verification Tests
        test('Upload and verify a document', async () => {
            const res = await request(app)
                .post(`/documents/upload?customerId=${customerId}`)
                .set('Authorization', `Bearer ${token}`)

                .attach('document', 'test/sample.png')
                .timeout(5000);

            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'Document uploaded successfully');
            expect(res.body).toHaveProperty('verificationStatus', 'verified');

            const document = await prisma.document.findFirst({
                where: { customerId: parseInt(customerId) }
            });
            expect(document).not.toBeNull();
            expect(document.verificationStatus).toBe('Verified');
        });

        test('should return 400 if no file is uploaded', async () => {
        const res = await request(app)
            .post(`/documents/upload?customerId=${customerId}`)
            .set('Authorization', `Bearer ${token}`);

        expect(res.statusCode).toEqual(400);
        expect(res.body).toHaveProperty('message', 'No file uploaded');
        });

        test('should fetch all customers whose documents are pending verification', async () => {
            const res = await request(app)
                .get('/services/get-pending-customers')
                .set('Authorization', `Bearer ${authToken}`);

            expect(res.statusCode).toEqual(200);
            expect(Array.isArray(res.body)).toBe(true);
        });

        test('should fetch all verified customers with inactive services', async () => {
            const res = await request(app)
                .get('/services/get-verified-customers')
                .set('Authorization', `Bearer ${authToken}`);
    
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
        });

        test('should fetch all customers with active services', async () => {
            const res = await request(app)
                .get('/services/get-activated-customers')
                .set('Authorization', `Bearer ${authToken}`);
    
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
        });


        test('should select a service for a customer', async () => {
            const res = await request(app)
                .post('/services/select-service')
                .set('Authorization', `Bearer ${token}`)
                .send({
                    planId:'1',
                    name: 'Test Service',
                    customerId: customerId
                });
    
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'Service selected successfully');
            expect(res.body).toHaveProperty('service');
            serviceId = res.body.service.id;
        });


        test('should activate a service for a customer', async () => {
            const res = await request(app)
                .post('/services/activate-service')
                .set('Authorization', `Bearer ${authToken}`)

                .send({
                    serviceId: serviceId
                });
    
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'Service activated successfully');
            expect(res.body.service.isActive).toBe(true);
        });

        test('should fetch all services', async () => {
            const res = await request(app)
                .get('/services/get-services')
                .set('Authorization', `Bearer ${token}`);

    
            expect(res.statusCode).toEqual(200);
            expect(res.body).toBeInstanceOf(Array);
        });

        test('Should resend OTP successfully if enough time has passed', async () => {
            // Update the customer so enough time has passed since last OTP creation
            await prisma.customer.update({
                where: { email: customerEmail },
                data: { createdAt: new Date(Date.now() - OTP_EXPIRY_TIME - 1000) } // 31 seconds ago
            });
    
            const res = await request(app)
                .post('/auth/resend-otp')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: customerEmail });
    
            expect(res.statusCode).toEqual(200);
            expect(res.body).toHaveProperty('message', 'New OTP sent successfully');
    
            // Ensure that the OTP was updated in the database
            const customer = await prisma.customer.findUnique({ where: { email: customerEmail } });
            expect(customer).not.toBeNull();
            expect(customer.otp).not.toEqual(123456); // OTP should be new
        });
    
        test('Should return 404 if customer does not exist', async () => {
            const res = await request(app)
                .post('/auth/resend-otp')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: 'nonexistent@example.com' });
    
            expect(res.statusCode).toEqual(404);
            expect(res.body).toHaveProperty('message', 'Customer not found');
        });
    
        test('Should return 400 if requesting OTP too soon', async () => {
            // Attempt to request OTP again without enough time passing
            const res = await request(app)
                .post('/auth/resend-otp')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: customerEmail });
    
            expect(res.statusCode).toEqual(400);
            expect(res.body).toHaveProperty('message', 'Please wait before requesting a new OTP.');
        });
    
        test('Should handle server errors gracefully', async () => {
            // Simulate a server error by manually causing one, for example, by passing an invalid email
            const res = await request(app)
                .post('/auth/resend-otp')
                .set('Authorization', `Bearer ${token}`)
                .send({ email: null }); // Passing null to cause a server error
    
            expect(res.statusCode).toEqual(500);
            expect(res.body).toHaveProperty('message', 'Error resending OTP');
        });

        test('Should create a plan successfully', async () => {
            const planData = {
                name: 'Basic Plan',
                description: 'This is a basic plan',
                price: 99.99,
                servicesIncluded: {},
                planType: 'monthly'
            };
    
            const res = await request(app)
                .post('/services/plans')
                .set('Authorization', `Bearer ${authToken}`)
                .send(planData);
    
            expect(res.statusCode).toEqual(201);
            expect(res.body).toHaveProperty('message', 'Plan created successfully');
            expect(res.body.plan).toHaveProperty('id'); // Ensure plan was created
    
            // Check if the plan was actually created in the database
            const plan = await prisma.plan.findUnique({ where: { id: res.body.plan.id } });
            expect(plan).not.toBeNull();
            expect(plan.name).toEqual(planData.name);
            expect(plan.description).toEqual(planData.description);
            expect(plan.price).toEqual(parseFloat(planData.price));
            expect(plan.servicesIncluded).toEqual(planData.servicesIncluded);
            expect(plan.planType).toEqual(planData.planType);
        });
    
        test('Should handle validation errors', async () => {
            const invalidPlanData = {
                name: '', // Invalid: empty name
                description: 'This plan has no name',
                price: 'invalid_price', // Invalid price
                servicesIncluded: ['Service 1'],
                planType: 'monthly'
            };
    
            const res = await request(app)
                .post('/services/plans')
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidPlanData);
    
            expect(res.statusCode).toEqual(500); 
            expect(res.body).toHaveProperty('message', 'Failed to create plan');
        });

        test('Should retrieve all plans from the database', async () => {
            const res = await request(app).get('/services/getplans');
            
            // Check response status code
            expect(res.statusCode).toBe(200);
            expect(Array.isArray(res.body)).toBe(true);
            
        });
    });
});
