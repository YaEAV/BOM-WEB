const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 52026;

// --- 核心修复：使用正确且稳妥的顺序来配置中间件 ---

// 1. 配置请求体解析器，并设置足够大的上限 (5MB)
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ limit: '5mb', extended: true }));

// 2. 启用CORS，允许跨域请求
app.use(cors());

// 3. 引入并使用路由模块
const materialRoutes = require('./routes/materials');
const versionRoutes = require('./routes/versions');
const lineRoutes = require('./routes/lines');
const supplierRoutes = require('./routes/suppliers');
const unitRoutes = require('./routes/units');
const drawingRoutes = require('./routes/drawings'); // <--- 新增此行

app.use('/api/materials', materialRoutes);
app.use('/api/versions', versionRoutes);
app.use('/api/lines', lineRoutes);
app.use('/api/suppliers', supplierRoutes);
app.use('/api/units', unitRoutes);
app.use('/api', drawingRoutes); // <--- 新增此行 (使用 /api 前缀以匹配端点)


// 根路由
app.get('/', (req, res) => {
    res.send('BOM Management System API is running!');
});

// 启动服务器
app.listen(port, '0.0.0.0', () => {
    console.log(`Server is running on http://0.0.0.0:${port}`);
});