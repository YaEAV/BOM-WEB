// bom-backend/server.js (最终修复版)

const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 52026;

// --- 核心修复：配置更健壮的CORS策略 ---
const corsOptions = {
    origin: '*', // 在生产环境中，建议替换为您的前端域名，例如 'http://localhost:3000'
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    exposedHeaders: ['Content-Disposition'], // 明确暴露Content-Disposition头
};

app.use(cors(corsOptions));
// 添加一个中间件来处理预检请求
app.options('*', cors(corsOptions));


// 1. 配置请求体解析器
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// 2. 引入并使用路由模块
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


// 根路由
app.get('/', (req, res) => {
    res.send('BOM Management System API is running!');
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});