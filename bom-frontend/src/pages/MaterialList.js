// src/pages/MaterialList.js (已修复导出文件名)
import React, { useState, useEffect } from 'react';
import { App as AntApp, Modal, Form, Radio, Upload, Button } from 'antd';
import { EditOutlined, DeleteOutlined, PlusOutlined, AppstoreOutlined, FileTextOutlined, SwapOutlined, UploadOutlined, DownloadOutlined, FileZipOutlined } from '@ant-design/icons';
import GenericListPage from '../components/GenericListPage';
import BomManagerDrawer from './BomManagerDrawer';
import DrawingManagerDrawer from './DrawingManagerDrawer';
import WhereUsedModal from '../components/WhereUsedModal';
import MaterialModal from '../components/MaterialModal';
import { materialService } from '../services/materialService';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';
import api from '../api';

const MaterialList = () => {
    const { message, modal } = AntApp.useApp();
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [bomDrawer, setBomDrawer] = useState({ visible: false, material: null, versionId: null });
    const [drawingDrawer, setDrawingDrawer] = useState({ visible: false, material: null });
    const [whereUsedModal, setWhereUsedModal] = useState({ visible: false, material: null });
    const [uploading, setUploading] = useState(false);
    const [exportingBOM, setExportingBOM] = useState(false);
    const [importMode, setImportMode] = useState('overwrite');
    const [suppliers, setSuppliers] = useState([]);
    const [units, setUnits] = useState([]);
    const [refreshKey, setRefreshKey] = useState(0);

    const refreshList = () => setRefreshKey(prev => prev + 1);

    useEffect(() => {
        supplierService.get({ limit: 10000 }).then(res => setSuppliers(res.data.data || []));
        unitService.get({ limit: 10000 }).then(res => setUnits(res.data.data || []));
    }, []);

    const hideAllModals = () => {
        setIsModalVisible(false);
        setEditingMaterial(null);
        setIsImportModalVisible(false);
        setBomDrawer({ visible: false, material: null, versionId: null });
        setDrawingDrawer({ visible: false, material: null });
        setWhereUsedModal({ visible: false, material: null });
    };

    const showEditModal = (material = null) => {
        setEditingMaterial(material);
        setIsModalVisible(true);
    };

    const handleModalOk = async (values) => {
        try {
            if (editingMaterial) {
                await materialService.update(editingMaterial.id, values);
            } else {
                await materialService.create(values);
            }
            message.success('操作成功');
            hideAllModals();
            refreshList();
        } catch (error) {
            // 错误已由全局拦截器处理
        }
    };

    const handleUploadChange = (info) => {
        if (info.file.status === 'uploading') setUploading(true);
        else if (info.file.status === 'done') {
            setUploading(false);
            setIsImportModalVisible(false);
            message.success(info.file.response.message || '导入成功');
            refreshList();
        } else if (info.file.status === 'error') {
            setUploading(false);
            // 全局拦截器已显示错误
        }
    };

    const handleExport = (ids) => {
        materialService.export(ids).then(response => {
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Materials_Export_${Date.now()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        }).catch(() => message.error('导出失败'));
    };

    const handleExportBomDrawings = (materialId) => {
        setExportingBOM(true);
        message.info('正在后台为您打包该物料的激活BOM层级图纸，请稍候...');
        api.post('/drawings/export-bom', { materialId }, { responseType: 'blob' })
            .then(response => {
                // --- 核心修改：从响应头中解析文件名 ---
                const contentDisposition = response.headers['content-disposition'];
                let fileName = `BOM_Drawings_Export_${Date.now()}.zip`; // 默认文件名
                if (contentDisposition) {
                    const filenameMatch = contentDisposition.match(/filename\*=UTF-8''([^;]+)/i);
                    if (filenameMatch && filenameMatch[1]) {
                        fileName = decodeURIComponent(filenameMatch[1]);
                    } else {
                        const fallbackMatch = contentDisposition.match(/filename="([^"]+)"/i);
                        if (fallbackMatch && fallbackMatch[1]) fileName = fallbackMatch[1];
                    }
                }

                const url = window.URL.createObjectURL(new Blob([response.data]));
                const link = document.createElement('a');
                link.href = url;
                link.setAttribute('download', fileName); // 使用解析出的文件名
                document.body.appendChild(link);
                link.click();
                link.remove();
                window.URL.revokeObjectURL(url); // 释放内存
            })
            .catch(() => {}) // 错误已由全局拦截器处理
            .finally(() => setExportingBOM(false));
    };

    const pageConfig = {
        service: materialService,
        columns: [
            { title: '物料编号', dataIndex: 'material_code', sorter: true },
            { title: '产品名称', dataIndex: 'name', sorter: true },
            { title: '规格描述', dataIndex: 'spec' },
            { title: '物料属性', dataIndex: 'category', sorter: true },
            { title: '单位', dataIndex: 'unit' },
        ],
        searchPlaceholder: '搜索物料编码、名称或规格...',
        initialSorter: { field: 'material_code', order: 'ascend' },
        toolbarButtonsConfig: (selectedRows, refresh, handleAction) => {
            const singleSelected = selectedRows.length === 1;
            const material = singleSelected ? selectedRows[0] : null;
            return [
                ...(selectedRows.length > 0 ? [
                    { text: '编辑', icon: <EditOutlined />, onClick: () => showEditModal(material), disabled: !singleSelected },
                    { text: 'BOM', icon: <AppstoreOutlined />, onClick: () => setBomDrawer({ visible: true, material }), disabled: !singleSelected },
                    { text: '反查', icon: <SwapOutlined />, onClick: () => setWhereUsedModal({ visible: true, material }), disabled: !singleSelected },
                    { text: '图纸', icon: <FileTextOutlined />, onClick: () => setDrawingDrawer({ visible: true, material }), disabled: !singleSelected },
                    { text: '移至回收站', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRows.length} 项吗?`, onClick: () => handleAction(() => materialService.delete(selectedRows.map(r => r.id)), '已移至回收站'), disabled: selectedRows.length === 0 },
                ] : []),
                { text: '新增物料', icon: <PlusOutlined />, type: 'primary', onClick: () => showEditModal() },
            ];
        },
        moreMenuItemsConfig: (selectedRows) => ([
            { key: 'import', icon: <UploadOutlined />, label: '批量导入物料', onClick: () => setIsImportModalVisible(true) },
            { key: 'export', icon: <DownloadOutlined />, label: '导出选中(Excel)', disabled: selectedRows.length === 0, onClick: () => handleExport(selectedRows.map(r => r.id)) },
            { type: 'divider' },
            { key: 'export-bom-drawings', icon: <FileZipOutlined />, label: '导出激活BOM图纸', disabled: selectedRows.length !== 1 || exportingBOM, onClick: () => handleExportBomDrawings(selectedRows[0].id) },
        ]),
    };

    return (
        <>
            <GenericListPage {...pageConfig} refreshKey={refreshKey} />

            <MaterialModal
                visible={isModalVisible}
                onCancel={hideAllModals}
                onOk={handleModalOk}
                editingMaterial={editingMaterial}
                suppliers={suppliers}
                units={units}
            />

            <Modal title="批量导入物料" open={isImportModalVisible} footer={null} onCancel={hideAllModals} destroyOnClose>
                <p>文件第一行为表头，必须包含: <strong>物料编码, 产品名称, 单位</strong>。</p>
                <a href={`${api.defaults.baseURL}/materials/template`} download>下载模板文件</a><br /><br />
                <Form.Item label="导入模式"><Radio.Group onChange={(e) => setImportMode(e.target.value)} value={importMode}><Radio value="overwrite">覆盖</Radio><Radio value="incremental">新增</Radio></Radio.Group></Form.Item>
                <Upload name="file" action={`${api.defaults.baseURL}/materials/import?mode=${importMode}`} showUploadList={false} onChange={handleUploadChange}>
                    <Button icon={<UploadOutlined />} style={{ width: '100%' }} loading={uploading}>选择文件并开始导入</Button>
                </Upload>
            </Modal>

            {bomDrawer.visible && <BomManagerDrawer visible={bomDrawer.visible} onClose={() => { hideAllModals(); refreshList(); }} material={bomDrawer.material} initialVersionId={bomDrawer.versionId} />}
            {drawingDrawer.visible && <DrawingManagerDrawer visible={drawingDrawer.visible} onClose={hideAllModals} material={drawingDrawer.material} />}
            {whereUsedModal.visible && <WhereUsedModal visible={whereUsedModal.visible} onCancel={hideAllModals} material={whereUsedModal.material} onJumpToBom={(materialId, versionId) => setBomDrawer({ visible: true, material: {id: materialId}, versionId })}/>}
        </>
    );
};

export default MaterialList;