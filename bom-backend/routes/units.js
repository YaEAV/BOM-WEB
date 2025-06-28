const express = require('express');
const router = express.Router();
const db = require('../config/db');

// GET: 获取所有单位
router.get('/', async (req, res) => {
    try {
        const [units] = await db.query('SELECT * FROM units ORDER BY name ASC');
        res.json(units);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// POST: 创建新单位
router.post('/', async (req, res) => {
    try {
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: '单位名称不能为空。' });
        const query = 'INSERT INTO units (name) VALUES (?)';
        const [result] = await db.query(query, [name]);
        res.status(201).json({ id: result.insertId, ...req.body });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// PUT: 更新单位
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { name } = req.body;
        if (!name) return res.status(400).json({ error: '单位名称不能为空。' });
        const query = 'UPDATE units SET name = ? WHERE id = ?';
        await db.query(query, [name, id]);
        res.json({ message: '单位更新成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// DELETE: 删除单位
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        await db.query('DELETE FROM units WHERE id = ?', [id]);
        res.json({ message: '单位删除成功' });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;