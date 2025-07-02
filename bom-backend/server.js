// bom-backend/server.js (已更新)

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 52026;

const corsOptions = {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
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

app.use('/api/materials', materialRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/units', unitRoutes);
app.use('/api', drawingRoutes);


app.get('/', (req, res) => {
    res.send('BOM Management System API is running!');
});

// --- 新增: 全局错误处理中间件 ---
// 这个中间件必须放在所有 app.use() 和路由定义的最后
app.use((err, req, res, next) => {
    console.error(err); // 在服务器控制台打印详细错误

    const statusCode = err.statusCode || 500;
    const errorCode = err.code || 'INTERNAL_SERVER_ERROR';
    const message = err.message || '服务器发生未知错误。';

    res.status(statusCode).json({
        error: {
            code: errorCode,
            message: message,
        }
    });
});


app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});