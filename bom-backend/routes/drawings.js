// bom-backend/routes/drawings.js

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

// **核心修复：配置 multer.diskStorage 来正确处理中文文件名**
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempPath = path.join(__dirname, '..', 'uploads', 'temp');
        fs.mkdirSync(tempPath, { recursive: true });
        cb(null, tempPath);
    },
    filename: function (req, file, cb) {
        // 使用原始文件名，并确保是 Buffer 形式再转码，防止预处理导致乱码
        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, fileName);
    }
});

const upload = multer({ storage: storage });

// 上传接口
router.post('/materials/:materialId/drawings', upload.array('drawingFiles'), async (req, res) => {
    const { materialId } = req.params;
    const { version, description } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ error: '没有提供图纸文件。' });
    }
    if (!version) {
        files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
        return res.status(400).json({ error: '必须提供图纸版本号/批次号。' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('UPDATE material_drawings SET is_active = false WHERE material_id = ?', [materialId]);
        const [[material]] = await connection.query('SELECT material_code FROM materials WHERE id = ?', [materialId]);
        if (!material) throw new Error('物料不存在，无法上传图纸。');

        const materialDir = path.join(__dirname, '..', 'uploads', 'drawings', material.material_code);
        fs.mkdirSync(materialDir, { recursive: true });

        for (const file of files) {
            const finalFileName = file.filename;
            const tempPath = file.path;
            const finalPath = path.join(materialDir, finalFileName);

            fs.renameSync(tempPath, finalPath);

            const relativePath = path.relative(path.join(__dirname, '..'), finalPath).replace(/\\/g, '/');

            const query = `
                INSERT INTO material_drawings
                (material_id, version, file_name, file_path, file_type, is_active, description, uploaded_by)
                VALUES (?, ?, ?, ?, ?, true, ?, ?)
            `;
            await connection.query(query, [materialId, version, finalFileName, relativePath, file.mimetype, description || null, 'system']);
        }
        await connection.commit();
        res.status(201).json({ message: `成功上传 ${files.length} 个图纸文件，并已激活。` });
    } catch (err) {
        await connection.rollback();
        files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
        console.error('上传图纸时发生错误:', err);
        if (err.code === 'ER_DUP_ENTRY') {
            res.status(409).json({ error: `上传失败：版本 "${version}" 中已存在同名文件。` });
        } else {
            res.status(500).json({ error: err.message || '服务器内部错误。' });
        }
    } finally {
        if (connection) connection.release();
    }
});


// ... [其余代码保持不变] ...
// 单文件下载
router.get('/drawings/:drawingId', async (req, res) => {
    try {
        const { drawingId } = req.params;
        const [[drawing]] = await db.query('SELECT file_path, file_name FROM material_drawings WHERE id = ?', [drawingId]);
        if (!drawing) return res.status(404).json({ error: '图纸文件未找到。' });

        const filePath = path.resolve(__dirname, '..', drawing.file_path);

        const fileName = encodeURIComponent(drawing.file_name);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);

        res.download(filePath, drawing.file_name);
    } catch (error) {
        res.status(500).json({ error: '下载失败。' });
    }
});

// 批量下载
router.get('/drawings/download/version', async (req, res) => {
    const { materialId, version } = req.query;
    if (!materialId || !version) {
        return res.status(400).json({ error: '必须提供物料ID和版本号。' });
    }
    try {
        const [drawings] = await db.query('SELECT * FROM material_drawings WHERE material_id = ? AND version = ?', [materialId, version]);
        if (drawings.length === 0) return res.status(404).json({ error: '未找到该版本的图纸文件。' });

        const [[material]] = await db.query('SELECT material_code FROM materials WHERE id = ?', [materialId]);
        const zipFileName = `${material.material_code}_${version}.zip`;

        const encodedZipFileName = encodeURIComponent(zipFileName);
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodedZipFileName}`);

        const archive = require('archiver')('zip', {
            zlib: { level: 9 },
            forceUTF8: true,
        });
        archive.pipe(res);

        for (const drawing of drawings) {
            const filePath = path.resolve(__dirname, '..', drawing.file_path);
            if (fs.existsSync(filePath)) {
                archive.file(filePath, { name: drawing.file_name });
            }
        }
        await archive.finalize();

    } catch (error) {
        console.error("批量下载图纸失败:", error);
        res.status(500).json({ error: '打包下载文件时出错。' });
    }
});

// 其他管理接口
router.put('/drawings/activate/version', async (req, res) => {
    const { materialId, version } = req.body;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        await connection.query('UPDATE material_drawings SET is_active = false WHERE material_id = ?', [materialId]);
        await connection.query('UPDATE material_drawings SET is_active = true WHERE material_id = ? AND version = ?', [materialId, version]);
        await connection.commit();
        res.json({ message: `版本 ${version} 已成功激活。` });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: '激活操作失败。' });
    } finally {
        if (connection) connection.release();
    }
});

router.get('/materials/:materialId/drawings', async (req, res) => {
    try {
        const { materialId } = req.params;
        const [drawings] = await db.query('SELECT * FROM material_drawings WHERE material_id = ? ORDER BY version DESC, file_name ASC', [materialId]);
        res.json(drawings);
    } catch (error) {
        res.status(500).json({ error: '获取图纸列表失败' });
    }
});

router.delete('/drawings/:drawingId', async (req, res) => {
    const { drawingId } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[drawing]] = await connection.query('SELECT file_path FROM material_drawings WHERE id = ?', [drawingId]);
        if (drawing) {
            const filePath = path.resolve(__dirname, '..', drawing.file_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        await connection.query('DELETE FROM material_drawings WHERE id = ?', [drawingId]);
        await connection.commit();
        res.json({ message: '图纸删除成功。' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: '删除失败。' });
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;