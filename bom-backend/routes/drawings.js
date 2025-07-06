const express = require('express');
const router = express.Router();
const db = require('../config/db');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const archiver = require('archiver');
const ExcelJS = require('exceljs');

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

// POST /materials/:materialId/drawings - 上传图纸接口
router.post('/materials/:materialId/drawings', upload.array('drawingFiles'), async (req, res, next) => {
    const { materialId } = req.params;
    const { version, description } = req.body;
    const files = req.files;

    try {
        if (!files || files.length === 0) {
            const err = new Error('没有提供图纸文件。');
            err.statusCode = 400;
            throw err;
        }
        if (!version) {
            files.forEach(file => { if (fs.existsSync(file.path)) fs.unlinkSync(file.path); });
            const err = new Error('必须提供图纸版本号/批次号。');
            err.statusCode = 400;
            throw err;
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
            if (err.code === 'ER_DUP_ENTRY') {
                const customError = new Error(`上传失败：版本 "${version}" 中已存在同名文件。`);
                customError.statusCode = 409;
                throw customError;
            }
            throw err;
        } finally {
            if (connection) connection.release();
        }
    } catch (err) {
        next(err);
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

// 递归函数，获取所有需要导出的文件/Buffer
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
            const childBomData = await getSingleLevelBom(connection, childActiveVersion.id);
            if (childBomData.length > 0) {
                const bomBuffer = await createBomExcelBuffer(childBomData);
                itemsToExport.push({
                    type: 'buffer',
                    buffer: bomBuffer,
                    zipPath: path.join(newPath, `${folderName}.xlsx`)
                });
            }

            const childItems = await getBomExportItems(connection, childActiveVersion.id, newPath, allActiveDrawings);
            itemsToExport = itemsToExport.concat(childItems);
        }
    }
    return itemsToExport;
}


// POST /drawings/export-bom - 按BOM层级导出单个物料的激活图纸
router.post('/drawings/export-bom', async (req, res, next) => {
    const { materialId } = req.body;
    const connection = await db.getConnection();
    try {
        if (!materialId) {
            const err = new Error('必须提供物料ID。');
            err.statusCode = 400;
            throw err;
        }

        const [activeBoms] = await connection.query(`
            SELECT v.id as version_id, v.version_code, m.id as material_id, m.material_code
            FROM bom_versions v JOIN materials m ON v.material_id = m.id
            WHERE v.is_active = true AND v.material_id = ?
        `, [materialId]);

        if (activeBoms.length === 0) {
            const err = new Error('该物料没有找到已激活的BOM版本。');
            err.statusCode = 404;
            throw err;
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

        const topBomData = await getSingleLevelBom(connection, bom.version_id);
        if (topBomData.length > 0) {
            const topBomBuffer = await createBomExcelBuffer(topBomData);
            archive.append(topBomBuffer, { name: path.join(bomRootPath, `${bom.version_code}.xlsx`) });
        }

        if (allActiveDrawings.has(bom.material_id)) {
            const rootDrawings = allActiveDrawings.get(bom.material_id);
            for (const drawing of rootDrawings) {
                const serverPath = path.resolve(__dirname, '..', drawing.file_path);
                if (fs.existsSync(serverPath)) {
                    archive.file(serverPath, { name: path.join(bomRootPath, drawing.file_name) });
                }
            }
        }

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
        next(err);
    } finally {
        if (connection) connection.release();
    }
});

// GET /drawings/:drawingId - 下载单个图纸
router.get('/drawings/:drawingId', async (req, res, next) => {
    try {
        const { drawingId } = req.params;
        const [[drawing]] = await db.query('SELECT file_path, file_name FROM material_drawings WHERE id = ?', [drawingId]);
        if (!drawing) {
            const err = new Error('图纸文件未找到。');
            err.statusCode = 404;
            throw err;
        }

        const filePath = path.resolve(__dirname, '..', drawing.file_path);
        const fileName = encodeURIComponent(drawing.file_name);
        res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${fileName}`);
        res.download(filePath, drawing.file_name);
    } catch (error) {
        next(error);
    }
});

// PUT /drawings/activate/version - 激活某个版本
router.put('/drawings/activate/version', async (req, res, next) => {
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
        error.message = '激活操作失败';
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

// GET /materials/:materialId/drawings - 获取物料的图纸列表
router.get('/materials/:materialId/drawings', async (req, res, next) => {
    try {
        const { materialId } = req.params;
        const [drawings] = await db.query('SELECT * FROM material_drawings WHERE material_id = ? AND deleted_at IS NULL ORDER BY version DESC, file_name ASC', [materialId]);
        res.json(drawings);
    } catch (error) {
        error.message = '获取图纸列表失败';
        next(error);
    }
});

// DELETE /drawings/:drawingId - 删除单个图纸
router.delete('/drawings/:drawingId', async (req, res, next) => {
    const { drawingId } = req.params;
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [[drawing]] = await connection.query('SELECT file_path FROM material_drawings WHERE id = ?', [drawingId]);
        if (drawing) {
            const filePath = path.resolve(__dirname, '..', drawing.file_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        }
        // 注意：这里是软删除，但也可以改为物理删除
        await connection.query('UPDATE material_drawings SET deleted_at = NOW() WHERE id = ?', [drawingId]);
        await connection.commit();
        res.json({ message: '图纸删除成功。' });
    } catch (error) {
        await connection.rollback();
        error.message = '删除图纸失败';
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

// --- 新增：批量删除图纸接口 (物理删除) ---
router.post('/drawings/delete-batch', async (req, res, next) => {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
        const err = new Error('需要提供一个包含ID的非空数组。');
        err.statusCode = 400;
        return next(err);
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        // 1. 查找所有待删除图纸的文件路径
        const [drawings] = await connection.query('SELECT file_path FROM material_drawings WHERE id IN (?)', [ids]);

        // 2. 从文件系统中删除物理文件
        for (const drawing of drawings) {
            if (drawing.file_path) {
                const filePath = path.resolve(__dirname, '..', drawing.file_path);
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        }

        // 3. 从数据库中删除记录
        const [result] = await connection.query('DELETE FROM material_drawings WHERE id IN (?)', [ids]);

        await connection.commit();
        res.json({ message: `成功删除了 ${result.affectedRows} 个图纸记录及其物理文件。` });

    } catch (error) {
        await connection.rollback();
        error.message = '批量删除图纸失败';
        next(error);
    } finally {
        if (connection) connection.release();
    }
});

module.exports = router;