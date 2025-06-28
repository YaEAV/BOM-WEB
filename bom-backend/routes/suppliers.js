const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET: 获取所有供应商
router.get('/', async (req, res) => {
    try {
        const [suppliers] = await db.query('SELECT * FROM suppliers ORDER BY name ASC');
        res.json(suppliers);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: 创建新供应商
router.post('/', async (req, res) => {
    try {
        const { name, contact, phone, address, remark } = req.body;
        if (!name) return res.status(400).json({ error: '供应商名称不能为空。' });
        const query = 'INSERT INTO suppliers (name, contact, phone, address, remark) VALUES (?, ?, ?, ?, ?)';
        const [result] = await db.query(query, [name, contact, phone, address, remark]);
        res.status(201).json({ id: result.insertId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT: 更新供应商
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name, contact, phone, address, remark } = req.body;
        if (!name) return res.status(400).json({ error: '供应商名称不能为空。' });
        const query = 'UPDATE suppliers SET name = ?, contact = ?, phone = ?, address = ?, remark = ? WHERE id = ?';
        await db.query(query, [name, contact, phone, address, remark, id]);
        res.json({ message: '供应商更新成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: 删除供应商
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        // 注意：在实际生产中，您可能需要检查此供应商是否仍被物料引用
        await db.query('DELETE FROM suppliers WHERE id = ?', [id]);
        res.json({ message: '供应商删除成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;