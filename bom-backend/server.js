// bom-backend/server.js (确认已修改)

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 52026;

const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-requested-with'],
    exposedHeaders: ['Content-Disposition'],
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions));


app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// --- 路由模块 ---
const materialRoutes = require('./routes/materials');
const versionRoutes = require('./routes/versions');
const lineRoutes = require('./routes/lines');
const supplierRoutes = require('./routes/suppliers');
const unitRoutes = require('./routes/units');
const drawingRoutes = require('./routes/drawings');
const cleanupRoutes = require('./routes/cleanup'); // 引入新路由

app.use('/api/materials', materialRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/units', unitRoutes);
app.use('/api', drawingRoutes);
app.use('/api/cleanup', cleanupRoutes); // 注册新路由


app.get('/', (req, res) => {
    res.send('BOM Management System API is running!');
});

app.use((err, req, res, next) => {
    console.error(err);
    const statusCode = err.statusCode || 500;
    const errorResponse = {
        error: {
            code: err.code || 'INTERNAL_SERVER_ERROR',
            message: err.message || '服务器发生未知错误。',
        }
    };
    if (err.errors && Array.isArray(err.errors)) {
        errorResponse.error.errors = err.errors;
    }
    res.status(statusCode).json(errorResponse);
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});