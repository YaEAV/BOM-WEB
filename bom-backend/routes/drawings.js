// bom-backend/routes/drawings.js (已按新需求修改)

const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const ExcelJS = require('exceljs');
const { getBomTreeNodes } = require('../utils/bomHelper');

// multer 存储配置
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        const tempPath = path.join(__dirname, '..', 'uploads', 'temp');
        fs.mkdirSync(tempPath, { recursive: true });
        cb(null, tempPath);
    },
    filename: function (req, file, cb) {
        const fileName = Buffer.from(file.originalname, 'latin1').toString('utf8');
        cb(null, fileName);
    }
});

const upload = multer({ storage: storage });

// POST /materials/:materialId/drawings - 上传图纸接口 (无变动)
router.post('/materials/:materialId/drawings', upload.array('drawingFiles'), async (req, res) => {
    // ... (此部分代码无变动, 为保持完整性而保留)
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


// 获取单层BOM数据的辅助函数
async function getSingleLevelBom(connection, versionId) {
    const query = `
        SELECT
            bl.position_code,
            m.material_code AS component_code,
            m.name AS component_name,
            m.spec AS component_spec,
            bl.quantity,
            m.unit AS component_unit,
            bl.process_info,
            bl.remark
        FROM bom_lines bl
        JOIN materials m ON bl.component_id = m.id
        WHERE bl.version_id = ?
        ORDER BY LENGTH(bl.position_code), bl.position_code ASC`;
    const [lines] = await connection.query(query, [versionId]);
    return lines;
}

// 创建BOM Excel Buffer的辅助函数
async function createBomExcelBuffer(bomData) {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet('BOM');
    worksheet.columns = [
        { header: '位置编号', key: 'position_code', width: 15 },
        { header: '子件编码', key: 'component_code', width: 25 },
        { header: '子件名称', key: 'component_name', width: 30 },
        { header: '规格', key: 'component_spec', width: 30 },
        { header: '用量', key: 'quantity', width: 15 },
        { header: '单位', key: 'component_unit', width: 15 },
        { header: '工艺说明', key: 'process_info', width: 30 },
        { header: '备注', key: 'remark', width: 30 },
    ];
    worksheet.getRow(1).font = { bold: true };
    worksheet.addRows(bomData);
    return workbook.xlsx.writeBuffer();
}

// **重构**: 递归函数，获取所有需要导出的文件/Buffer
async function getBomExportItems(connection, versionId, currentPath, allActiveDrawings) {
    let itemsToExport = [];
    const [lines] = await connection.query(`
                SELECT bl.id, bl.position_code, m.id as component_id, m.material_code as component_code
                FROM bom_lines bl JOIN materials m ON bl.component_id = m.id
                WHERE bl.version_id = ? ORDER BY bl.position_code ASC`,
        [versionId]
    );

    for (const line of lines) {
        const [[childActiveVersion]] = await connection.query('SELECT id, version_code FROM bom_versions WHERE material_id = ? AND is_active = true LIMIT 1', [line.component_id]);

        let folderName = `${line.position_code}_${line.component_code}`;
        if (childActiveVersion && childActiveVersion.version_code) {
            const versionSuffix = childActiveVersion.version_code.split('_').pop() || 'VER';
            folderName += `_${versionSuffix}`;
        }

        const newPath = path.join(currentPath, folderName);

        // 添加该子件的图纸文件
        if (allActiveDrawings.has(line.component_id)) {
            const drawings = allActiveDrawings.get(line.component_id);
            for (const drawing of drawings) {
                const serverPath = path.resolve(__dirname, '..', drawing.file_path);
                if (fs.existsSync(serverPath)) {
                    itemsToExport.push({
                        type: 'file',
                        serverPath,
                        zipPath: path.join(newPath, drawing.file_name)
                    });
                }
            }
        }

        // 如果子件有激活的BOM版本，则为其生成BOM清单并递归
        if (childActiveVersion) {
            // **新增**: 为子件生成BOM清单Excel
            const childBomData = await getSingleLevelBom(connection, childActiveVersion.id);
            if (childBomData.length > 0) {
                const bomBuffer = await createBomExcelBuffer(childBomData);
                itemsToExport.push({
                    type: 'buffer',
                    buffer: bomBuffer,
                    zipPath: path.join(newPath, `${folderName}.xlsx`) // 文件名与文件夹名一致
                });
            }

            // **修改**: 递归调用
            const childItems = await getBomExportItems(connection, childActiveVersion.id, newPath, allActiveDrawings);
            itemsToExport = itemsToExport.concat(childItems);
        }
    }
    return itemsToExport;
}


// POST /drawings/export-bom - 按BOM层级导出单个物料的激活图纸 (已重构)
router.post('/drawings/export-bom', async (req, res) => {
    const { materialId } = req.body;
    if (!materialId) {
        return res.status(400).json({ error: '必须提供物料ID。' });
    }

    const connection = await db.getConnection();
    try {
        const [activeBoms] = await connection.query(`
            SELECT v.id as version_id, v.version_code, m.id as material_id, m.material_code
            FROM bom_versions v JOIN materials m ON v.material_id = m.id
            WHERE v.is_active = true AND v.material_id = ?
        `, [materialId]);

        if (activeBoms.length === 0) {
            return res.status(404).json({ error: '该物料没有找到已激活的BOM版本。' });
        }
        const bom = activeBoms[0];

        const [allDrawings] = await connection.query('SELECT material_id, file_path, file_name FROM material_drawings WHERE is_active = true');
        const allActiveDrawings = new Map();
        allDrawings.forEach(d => {
            if (!allActiveDrawings.has(d.material_id)) allActiveDrawings.set(d.material_id, []);
            allActiveDrawings.get(d.material_id).push(d);
        });

        const bomRootPath = `${bom.material_code}_${bom.version_code.split('_').pop()}`;
        const zipFileName = `BOM_${bom.version_code}.zip`;

        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`);

        const archive = archiver('zip', { zlib: { level: 9 }, forceUTF8: true });
        archive.pipe(res);

        // 1. 添加顶层物料的BOM清单
        const topBomData = await getSingleLevelBom(connection, bom.version_id);
        if (topBomData.length > 0) {
            const topBomBuffer = await createBomExcelBuffer(topBomData);
            archive.append(topBomBuffer, { name: path.join(bomRootPath, `${bom.version_code}.xlsx`) }); // **修改**: 按版本号命名
        }

        // 2. 添加顶层物料的图纸
        if (allActiveDrawings.has(bom.material_id)) {
            const rootDrawings = allActiveDrawings.get(bom.material_id);
            for (const drawing of rootDrawings) {
                const serverPath = path.resolve(__dirname, '..', drawing.file_path);
                if (fs.existsSync(serverPath)) {
                    archive.file(serverPath, { name: path.join(bomRootPath, drawing.file_name) });
                }
            }
        }

        // 3. 获取并添加所有子项的文件和BOM清单
        const childItems = await getBomExportItems(connection, bom.version_id, bomRootPath, allActiveDrawings);
        for (const item of childItems) {
            if (item.type === 'file') {
                archive.file(item.serverPath, { name: item.zipPath });
            } else if (item.type === 'buffer') {
                archive.append(item.buffer, { name: item.zipPath });
            }
        }

        await archive.finalize();

    } catch (err) {
        console.error("BOM图纸导出失败:", err);
        res.status(500).json({ error: '服务器在处理导出请求时发生意外错误。' });
    } finally {
        if (connection) connection.release();
    }
});


// ... (其余接口无变动, 为保持完整性而保留)

// GET /drawings/:drawingId - 下载单个图纸
router.get('/drawings/:drawingId', async (req, res) => {
    // ...
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

// PUT /drawings/activate/version - 激活某个版本
router.put('/drawings/activate/version', async (req, res) => {
    // ...
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

// GET /materials/:materialId/drawings - 获取物料的图纸列表
router.get('/materials/:materialId/drawings', async (req, res) => {
    // ...
    try {
        const { materialId } = req.params;
        const [drawings] = await db.query('SELECT * FROM material_drawings WHERE material_id = ? ORDER BY version DESC, file_name ASC', [materialId]);
        res.json(drawings);
    } catch (error) {
        res.status(500).json({ error: '获取图纸列表失败' });
    }
});

// DELETE /drawings/:drawingId - 删除单个图纸
router.delete('/drawings/:drawingId', async (req, res) => {
    // ...
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