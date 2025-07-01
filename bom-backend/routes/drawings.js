// bom-backend/routes/drawings.js (Fully Replaced & Corrected)

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');

// Use multer's temporary storage to handle file uploads
const upload = multer({ dest: path.join(__dirname, '..', 'uploads', 'temp') });

// POST /api/materials/:materialId/drawings - Fix for multi-file upload with unique constraint
router.post('/materials/:materialId/drawings', upload.array('drawingFiles'), async (req, res) => {
    const { materialId } = req.params;
    const { version: baseVersion, description } = req.body;
    const files = req.files;

    if (!files || files.length === 0) {
        return res.status(400).json({ error: '没有提供图纸文件。' });
    }
    if (!baseVersion) {
        files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
        return res.status(400).json({ error: '必须提供图纸版本号/批次号。' });
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // Step 1: Deactivate all other drawings for this material.
        // The new batch will become the only active one.
        await connection.query('UPDATE material_drawings SET is_active = false WHERE material_id = ?', [materialId]);

        // Step 2: Get material info for creating the directory path
        const [[material]] = await connection.query('SELECT material_code FROM materials WHERE id = ?', [materialId]);
        if (!material) {
            throw new Error('物料不存在，无法上传图纸。');
        }

        const materialDir = path.join(__dirname, '..', 'uploads', 'drawings', material.material_code);
        fs.mkdirSync(materialDir, { recursive: true });

        // Step 3: Loop through each file, create a unique version for it, and insert into the DB.
        for (const [index, file] of files.entries()) {
            // If more than one file is uploaded, create a unique sub-version (e.g., "V1.0-1", "V1.0-2")
            const uniqueVersion = files.length > 1 ? `${baseVersion}-${index + 1}` : baseVersion;

            // Use a clean file name for storage to avoid path issues
            const finalFileName = file.originalname;
            const finalPath = path.join(materialDir, finalFileName);

            // Move the file from temp storage to its final destination
            fs.renameSync(file.path, finalPath);

            const relativePath = path.relative(path.join(__dirname, '..'), finalPath).replace(/\\/g, '/');

            const query = `
                INSERT INTO material_drawings
                (material_id, version, file_name, file_path, file_type, is_active, description, uploaded_by)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON DUPLICATE KEY UPDATE
                file_path = VALUES(file_path), file_type = VALUES(file_type), is_active = VALUES(is_active),
                description = VALUES(description), uploaded_by = VALUES(uploaded_by), uploaded_at = NOW()
            `;

            // Insert a new row for each file with its unique version. All files in the new batch are active.
            await connection.query(query, [materialId, uniqueVersion, finalFileName, relativePath, file.mimetype, true, description || null, 'system']);
        }

        await connection.commit();
        res.status(201).json({ message: `成功上传 ${files.length} 个图纸文件。` });
    } catch (err) {
        await connection.rollback();
        // Cleanup temp files on error
        files.forEach(file => { if (fs.existsSync(file.path)) { fs.unlinkSync(file.path); } });

        console.error('上传图纸时发生错误:', err);
        res.status(500).json({ error: err.message || '服务器内部错误。' });
    } finally {
        if (connection) connection.release();
    }
});


// --- OTHER ROUTES (Unchanged) ---

// GET /api/materials/:materialId/drawings
router.get('/materials/:materialId/drawings', async (req, res) => {
    try {
        const { materialId } = req.params;
        const [drawings] = await db.query('SELECT * FROM material_drawings WHERE material_id = ? ORDER BY uploaded_at DESC', [materialId]);
        res.json(drawings);
    } catch (error) {
        res.status(500).json({ error: '获取图纸列表失败' });
    }
});

// PUT /api/drawings/:drawingId/activate
router.put('/drawings/:drawingId/activate', async (req, res) => {
    const { drawingId } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[drawing]] = await connection.query('SELECT material_id FROM material_drawings WHERE id = ?', [drawingId]);
        if (!drawing) throw new Error('图纸不存在');
        await connection.query('UPDATE material_drawings SET is_active = false WHERE material_id = ?', [drawing.material_id]);
        await connection.query('UPDATE material_drawings SET is_active = true WHERE id = ?', [drawingId]);
        await connection.commit();
        res.json({ message: '图纸已成功激活。' });
    } catch (error) {
        await connection.rollback();
        res.status(500).json({ error: '激活操作失败。' });
    } finally {
        if (connection) connection.release();
    }
});

// GET /api/drawings/:drawingId
router.get('/drawings/:drawingId', async (req, res) => {
    try {
        const { drawingId } = req.params;
        const [[drawing]] = await db.query('SELECT file_path, file_name FROM material_drawings WHERE id = ?', [drawingId]);
        if (!drawing) return res.status(404).json({ error: '图纸文件未找到。' });
        const filePath = path.resolve(__dirname, '..', drawing.file_path);
        res.download(filePath, drawing.file_name);
    } catch (error) {
        res.status(500).json({ error: '下载失败。' });
    }
});

// DELETE /api/drawings/:drawingId
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

async function getBomDrawingFiles(connection, versionId, currentPath, allActiveDrawings) {
    let fileList = [];
    const [lines] = await connection.query(`SELECT bl.id, bl.position_code, m.id as component_id, m.material_code FROM bom_lines bl JOIN materials m ON bl.component_id = m.id WHERE bl.version_id = ? ORDER BY bl.position_code ASC`, [versionId]);
    for (const line of lines) {
        const newPath = path.join(currentPath, `${line.position_code}_${line.component_code}`);
        if (allActiveDrawings.has(line.component_id)) {
            const drawing = allActiveDrawings.get(line.component_id);
            const serverPath = path.resolve(__dirname, '..', drawing.file_path);
            if (fs.existsSync(serverPath)) {
                fileList.push({ serverPath, zipPath: path.join(newPath, drawing.file_name) });
            }
        }
        const [[childActiveVersion]] = await connection.query('SELECT id FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1', [line.component_id]);
        if (childActiveVersion) {
            const childFiles = await getBomDrawingFiles(connection, childActiveVersion.id, newPath, allActiveDrawings);
            fileList = fileList.concat(childFiles);
        }
    }
    return fileList;
}

router.post('/drawings/export-active-boms', async (req, res) => {
    const connection = await db.getConnection();
    try {
        const [activeBoms] = await connection.query(`SELECT v.id as version_id, v.version_code, m.id as material_id, m.material_code FROM bom_versions v JOIN materials m ON v.material_id = m.id WHERE v.is_active = true`);
        if (activeBoms.length === 0) return res.status(404).json({ error: '没有激活的BOM版本。' });

        const [allDrawings] = await connection.query('SELECT material_id, file_path, file_name FROM material_drawings WHERE is_active = true');
        const allActiveDrawings = new Map(allDrawings.map(d => [d.material_id, d]));

        const zipFileName = `BOM_Drawings_Export_${new Date().toISOString().slice(0,10)}.zip`;
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);

        const archive = archiver('zip', { zlib: { level: 9 } });
        archive.pipe(res);

        for (const bom of activeBoms) {
            const bomRootPath = `${bom.material_code}_${bom.version_code}`;
            let filesToZip = [];
            if (allActiveDrawings.has(bom.material_id)) {
                const rootDrawing = allActiveDrawings.get(bom.material_id);
                const serverPath = path.resolve(__dirname, '..', rootDrawing.file_path);
                if (fs.existsSync(serverPath)) {
                    filesToZip.push({ serverPath, zipPath: path.join(bomRootPath, rootDrawing.file_name) });
                }
            }
            const childFiles = await getBomDrawingFiles(connection, bom.version_id, bomRootPath, allActiveDrawings);
            filesToZip = filesToZip.concat(childFiles);
            for (const file of filesToZip) {
                archive.file(file.serverPath, { name: file.zipPath });
            }
        }
        await archive.finalize();
    } catch (err) {
        console.error("批量导出图纸失败:", err);
        res.status(500).json({ error: '服务器在处理导出请求时发生意外错误。' });
    } finally {
        if (connection) connection.release();
    }
});


module.exports = router;