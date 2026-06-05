const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
require('dotenv').config();

const { ensureRootOrganizationUnit } = require('./utils/ensureRootOrganizationUnit');
const { ensureSeedAdminUser } = require('./utils/ensureSeedAdminUser');
const { authenticate, authorize } = require('./middleware/auth');

const app = express();
const prisma = new PrismaClient();

// Middlewares
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// KHAI BÁO ROUTERS
const authRouter = require('./routes/authRoutes');
const userRouter = require('./routes/userRoutes');
const organizationRouter = require('./routes/organizationRoutes');
const cohortRouter = require('./routes/cohortRoutes');
const semesterRouter = require('./routes/semesterRoutes');

const courseRouter = require('./routes/courseRoutes');
const majorRouter = require('./routes/majorRoutes');
const curriculumRouter = require('./routes/curriculumRoutes');
const studentGroupRouter = require('./routes/studentGroupRoutes');

const lecturerRouter = require('./routes/lecturerRoutes');
const roomRouter = require('./routes/roomRoutes');
const courseSectionRouter = require('./routes/courseSectionRoutes');
const timetableRouter = require('./routes/timetableRoutes');
const importRouter = require('./routes/importRoutes');
const settingsRouter = require('./routes/settingsRoutes');
const assignmentRequestRouter = require('./routes/assignmentRequestRoutes');

// BullMQ worker for async AI scheduling
require('./queues/schedulerQueue');

// Auth (login public; /users protected inside router)
app.use('/api/v1/auth', authRouter);

app.use(authenticate);
app.use(authorize);

// ĐĂNG KÝ SỬ DỤNG ROUTERS
app.use('/api/v1/users', userRouter);
app.use('/api/v1/organization-units', organizationRouter);
app.use('/api/v1/cohorts', cohortRouter);
app.use('/api/v1/semesters', semesterRouter);

app.use('/api/v1/courses', courseRouter);
app.use('/api/v1/majors', majorRouter);
app.use('/api/v1/curricula', curriculumRouter);
app.use('/api/v1/student-groups', studentGroupRouter);

app.use('/api/v1/lecturers', lecturerRouter);
app.use('/api/v1/rooms', roomRouter);
app.use('/api/v1/course-sections', courseSectionRouter);
app.use('/api/v1/timetables', timetableRouter);

app.use('/api/v1/imports', importRouter);
app.use('/api/v1/settings', settingsRouter);
app.use('/api/v1/assignment-requests', assignmentRequestRouter);

// Base Health Check Route
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'success',
        message: 'Phenitime Backend is up and running securely with Prisma!',
        timestamp: new Date().toISOString()
    });
});

// Khởi động server
const PORT = process.env.PORT || 5000;
app.listen(PORT, async () => {
    try {
        await ensureRootOrganizationUnit(prisma);
        await ensureSeedAdminUser(prisma);
    } catch (error) {
        console.error('Failed to ensure root organization unit:', error.message);
    }

    console.log(`🚀 Server is running on http://localhost:${PORT}`);
});