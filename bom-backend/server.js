const express = require('express');
const cors = require('cors');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 5000;

// 中间件
app.use(cors()); // 允许所有跨域请求
app.use(express.json()); // 解析JSON请求体

// 路由
const materialRoutes = require('./routes/materials');
const versionRoutes = require('./routes/versions'); // 新增
const lineRoutes = require('./routes/lines');       // 新增
// ... 其他路由 (稍后添加)

app.use('/api/materials', materialRoutes);
app.use('/api/versions', versionRoutes); // 新增
app.use('/api/lines', lineRoutes);       // 新增

app.get('/', (req, res) => {
    res.send('BOM Management System API is running!');
});

app.listen(port, () => {
    console.log(`Server is running on port: ${port}`);
});