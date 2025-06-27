const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET: 获取所有物料 (带搜索和分页功能)
router.get('/', async (req, res) => {
    try {
        const { search, page = 1, limit = 20 } = req.query; // 默认每页20条
        const offset = (page - 1) * limit;

        let countQuery = 'SELECT COUNT(*) as total FROM materials';
        let dataQuery = 'SELECT * FROM materials';
        const params = [];

        if (search) {
            const searchQuery = ' WHERE material_code LIKE ? OR name LIKE ? OR alias LIKE ?';
            countQuery += searchQuery;
            dataQuery += searchQuery;
            params.push(`%${search}%`, `%${search}%`, `%${search}%`);
        }

        dataQuery += ' ORDER BY id DESC LIMIT ? OFFSET ?';
        const dataParams = [...params, parseInt(limit), parseInt(offset)];

        const [[{ total }]] = await db.query(countQuery, params);
        const [materials] = await db.query(dataQuery, dataParams);

        res.json({
            data: materials,
            total,
            hasMore: (offset + materials.length) < total
        });

    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: 创建新物料
router.post('/', async (req, res) => {
    try {
        const { material_code, name, alias, spec, category, unit, supplier, remark } = req.body;
        const query = 'INSERT INTO materials (material_code, name, alias, spec, category, unit, supplier, remark) VALUES (?, ?, ?, ?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [material_code, name, alias, spec, category, unit, supplier, remark]);
        res.status(201).json({ id: result.insertId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT: 更新物料
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { material_code, name, alias, spec, category, unit, supplier, remark } = req.body;
        const query = 'UPDATE materials SET material_code = ?, name = ?, alias = ?, spec = ?, category = ?, unit = ?, supplier = ?, remark = ? WHERE id = ?';
        await db.query(query, [material_code, name, alias, spec, category, unit, supplier, remark, id]);
        res.json({ message: 'Material updated successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: 删除物料 (支持批量删除)
router.post('/delete', async (req, res) => {
    try {
        const { ids } = req.body; // 接收一个ID数组
        if (!ids || ids.length === 0) {
            return res.status(400).json({ message: 'No IDs provided for deletion.' });
        }
        const query = 'DELETE FROM materials WHERE id IN (?)';
        await db.query(query, [ids]);
        res.json({ message: 'Materials deleted successfully' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// GET: 用于BOM行项目选择器的轻量级物料搜索
router.get('/search', async (req, res) => {
    try {
        const { term } = req.query; // 搜索词
        if (!term) {
            return res.json([]);
        }
        // 只查询必要的字段，并限制返回数量
        const query = `
            SELECT id, material_code, name, spec 
            FROM materials 
            WHERE material_code LIKE ? OR name LIKE ? 
            LIMIT 15
        `;
        const params = [`%${term}%`, `%${term}%`];
        const [results] = await db.query(query, params);
        res.json(results);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;