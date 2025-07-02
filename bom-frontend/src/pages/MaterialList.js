// src/pages/MaterialList.js (完整最终版 - 已恢复所有函数逻辑)
import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Select, Spin, Upload, Popover, Dropdown, Menu, Typography } from 'antd';
import { MoreOutlined, DownloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, PlusOutlined, FileTextOutlined, AppstoreOutlined, FileZipOutlined, SwapOutlined } from '@ant-design/icons';

import { materialService } from '../services/materialService';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';

import BomManagerDrawer from './BomManagerDrawer';
import DrawingManagerDrawer from './DrawingManagerDrawer';
import WhereUsedModal from '../components/WhereUsedModal';
import api from '../api';

const { Option } = Select;
const { Text } = Typography;

const initialState = {
    isModalVisible: false,
    editingMaterial: null,
    isImportModalVisible: false,
    bomDrawer: { visible: false, material: null, versionId: null },
    drawingDrawer: { visible: false, material: null },
    whereUsedModal: { visible: false, material: null },
    uploading: false,
    exporting: false,
    exportingBOM: false,
};

function uiStateReducer(state, action) {
    switch (action.type) {
        case 'SHOW_EDIT_MODAL':
            return { ...state, isModalVisible: true, editingMaterial: action.payload };
        case 'SHOW_IMPORT_MODAL':
            return { ...state, isImportModalVisible: true };
        case 'SHOW_BOM_DRAWER':
            return { ...state, bomDrawer: { visible: true, ...action.payload } };
        case 'SHOW_DRAWING_DRAWER':
            return { ...state, drawingDrawer: { visible: true, ...action.payload } };
        case 'SHOW_WHERE_USED_MODAL':
            return { ...state, whereUsedModal: { visible: true, ...action.payload } };
        case 'SET_UPLOADING':
            return { ...state, uploading: action.payload };
        case 'SET_EXPORTING':
            return { ...state, exporting: action.payload };
        case 'SET_EXPORTING_BOM':
            return { ...state, exportingBOM: action.payload };
        case 'HIDE_ALL':
            return {
                ...state,
                isModalVisible: false,
                isImportModalVisible: false,
                bomDrawer: { visible: false, material: null, versionId: null },
                drawingDrawer: { visible: false, material: null },
                whereUsedModal: { visible: false, material: null },
                editingMaterial: null,
            };
        default:
            return state;
    }
}

const MaterialList = () => {
    const [uiState, dispatch] = useReducer(uiStateReducer, initialState);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [sorter, setSorter] = useState({ field: 'material_code', order: 'ascend' });
    const [currentSearch, setCurrentSearch] = useState('');
    const [form] = Form.useForm();

    const [suppliers, setSuppliers] = useState([]);
    const [units, setUnits] = useState([]);

    const {
        data: materials,
        loading,
        hasMore,
        handleScroll,
        research,
        refresh,
        updateItemInData
    } = useInfiniteScroll(materialService.getMaterials, {
        sortBy: sorter.field,
        sortOrder: sorter.order === 'descend' ? 'desc' : 'asc'
    });

    useEffect(() => {
        supplierService.getSuppliers({ limit: 1000 })
            .then(res => setSuppliers(res.data.data || res.data))
            .catch(() => message.error("加载供应商数据失败"));

        unitService.getUnits({ limit: 1000 })
            .then(res => setUnits(res.data.data || res.data))
            .catch(() => message.error("加载单位数据失败"));
    }, []);

    const handleSearch = (value) => {
        setCurrentSearch(value);
        research({ search: value });
    };

    const handleTableChange = (pagination, filters, newSorter) => {
        const newSorterState = { field: newSorter.field || 'material_code', order: newSorter.order || 'ascend' };
        if (newSorterState.field !== sorter.field || newSorterState.order !== sorter.order) {
            setSorter(newSorterState);
            research({ sortBy: newSorterState.field, sortOrder: newSorterState.order === 'descend' ? 'desc' : 'asc' });
        }
    };

    const showEditModal = (material = null) => {
        form.setFieldsValue(material || { category: '外购' });
        dispatch({ type: 'SHOW_EDIT_MODAL', payload: material });
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            if (uiState.editingMaterial) {
                await materialService.updateMaterial(uiState.editingMaterial.id, values);
                message.success('更新成功');
                updateItemInData(uiState.editingMaterial.id, values);
            } else {
                await materialService.createMaterial(values);
                message.success('创建成功');
                refresh();
            }
            dispatch({ type: 'HIDE_ALL' });
        } catch (error) {
            message.error(error.response?.data?.error?.message || '操作失败');
        }
    };

    const handleDelete = async () => {
        try {
            await materialService.deleteMaterials(selectedRowKeys);
            message.success(`成功删除 ${selectedRowKeys.length} 项`);
            setSelectedRowKeys([]);
            refresh();
        } catch (error) { message.error(error.response?.data?.error?.details || '删除失败'); }
    };

    const handleSelectAll = async () => {
        try {
            const response = await materialService.getAllMaterialIds(currentSearch);
            setSelectedRowKeys(response.data);
        } catch (error) { message.error('获取全部物料ID失败'); }
    };

    const handleExport = async (type) => {
        if (type === 'selected' && selectedRowKeys.length === 0) return message.warning('请至少选择一项进行导出。');
        dispatch({ type: 'SET_EXPORTING', payload: true });
        try {
            const response = await materialService.exportMaterials(type === 'selected' ? selectedRowKeys : []);
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `Materials_Export_${Date.now()}.xlsx`);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) { message.error('导出失败'); }
        finally { dispatch({ type: 'SET_EXPORTING', payload: false }); }
    };

    const handleExportActiveBomDrawings = async () => {
        if (selectedRowKeys.length !== 1) {
            message.warning('请选择一个物料进行导出。');
            return;
        }
        dispatch({ type: 'SET_EXPORTING_BOM', payload: true });
        message.info('正在后台为您打包该物料的激活BOM层级图纸，请稍候...');
        try {
            const materialId = selectedRowKeys[0];
            const response = await api.post('/drawings/export-bom', { materialId }, { responseType: 'blob' });
            const contentDisposition = response.headers['content-disposition'];
            let fileName = `BOM_Drawings_Export_${Date.now()}.zip`;
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
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            link.remove();
            window.URL.revokeObjectURL(url);
        } catch (error) {
            const errorMsg = await error.response?.data?.text?.() || error.response?.data?.error?.message || '导出BOM层级图纸失败';
            message.error(errorMsg);
        } finally {
            dispatch({ type: 'SET_EXPORTING_BOM', payload: false });
        }
    };

    const handleJumpToBom = useCallback(async (parentMaterialId, versionId) => {
        try {
            const res = await materialService.getMaterialById(parentMaterialId);
            dispatch({ type: 'HIDE_ALL' });
            dispatch({ type: 'SHOW_BOM_DRAWER', payload: { material: res.data, versionId } });
        } catch (err) {
            message.error('找不到对应的父物料信息。');
        }
    }, []);

    const uploadProps = {
        name: 'file',
        action: `${api.defaults.baseURL}/materials/import`,
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') dispatch({ type: 'SET_UPLOADING', payload: true });
            if (info.file.status === 'done') {
                dispatch({ type: 'SET_UPLOADING', payload: false });
                dispatch({ type: 'HIDE_ALL' });
                message.success(info.file.response.message || '导入成功');
                refresh();
            } else if (info.file.status === 'error') {
                dispatch({ type: 'SET_UPLOADING', payload: false });
                message.error(info.file.response?.error?.message || '导入失败');
            }
        },
    };

    const columns = [
        { title: '物料编号', dataIndex: 'material_code', key: 'material_code', sorter: true, showSorterTooltip: false, width: 120 },
        { title: '产品名称', dataIndex: 'name', key: 'name', sorter: true, showSorterTooltip: false, width: 150 },
        { title: '别名', dataIndex: 'alias', key: 'alias', width: 120 },
        { title: '规格描述', dataIndex: 'spec', key: 'spec', width: 300, render: (text) => text && text.length > 20 ? <Popover content={<div style={{ width: 300, whiteSpace: 'pre-wrap' }}>{text}</div>}><span style={{ cursor: 'pointer' }}>{text.substring(0, 20)}...</span></Popover> : text },
        { title: '物料属性', dataIndex: 'category', key: 'category', sorter: true, showSorterTooltip: false, width: 100 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
        { title: '供应商', dataIndex: 'supplier', key: 'supplier', sorter: true, showSorterTooltip: false, width: 120 },
        { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, render: (text) => text && text.length > 20 ? <Popover content={<div style={{ width: 300, whiteSpace: 'pre-wrap' }}>{text}</div>}><span style={{ cursor: 'pointer' }}>{text.substring(0, 20)}...</span></Popover> : text },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: setSelectedRowKeys,
        selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE, { key: 'selectAllData', text: '选择所有数据', onSelect: handleSelectAll }],
    };

    const renderToolbar = () => {
        const hasSelected = selectedRowKeys.length > 0;
        const singleSelected = selectedRowKeys.length === 1;
        const material = singleSelected ? materials.find(m => m.id === selectedRowKeys[0]) : null;

        const moreMenu = (
            <Menu>
                <Menu.Item key="import" icon={<UploadOutlined />} onClick={() => dispatch({ type: 'SHOW_IMPORT_MODAL' })}>
                    批量导入物料
                </Menu.Item>
                <Menu.Item key="export" icon={<DownloadOutlined />} disabled={uiState.exporting} onClick={() => handleExport('selected')}>
                    导出选中(Excel)
                </Menu.Item>
                <Menu.Divider />
                <Menu.Item key="export-bom-drawings" icon={<FileZipOutlined />} disabled={!singleSelected || uiState.exportingBOM} onClick={handleExportActiveBomDrawings}>
                    导出激活BOM图纸
                </Menu.Item>
            </Menu>
        );

        return (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                    <Input.Search placeholder="搜索..." onSearch={handleSearch} style={{ width: 250 }} allowClear />
                    {hasSelected && <Text strong>已选择 {selectedRowKeys.length} 项</Text>}
                </Space>
                <Space>
                    {hasSelected && (
                        <>
                            <Button icon={<EditOutlined />} onClick={() => showEditModal(material)} disabled={!singleSelected}>编辑</Button>
                            <Button icon={<AppstoreOutlined />} onClick={() => dispatch({ type: 'SHOW_BOM_DRAWER', payload: { material } })} disabled={!singleSelected}>BOM</Button>
                            <Button icon={<SwapOutlined />} onClick={() => dispatch({ type: 'SHOW_WHERE_USED_MODAL', payload: { material } })} disabled={!singleSelected}>反查</Button>
                            <Button icon={<FileTextOutlined />} onClick={() => dispatch({ type: 'SHOW_DRAWING_DRAWER', payload: { material } })} disabled={!singleSelected}>图纸</Button>
                            <Popconfirm title={`确定删除选中的 ${selectedRowKeys.length} 项吗?`} onConfirm={handleDelete}><Button danger icon={<DeleteOutlined />}>删除</Button></Popconfirm>
                        </>
                    )}
                    <Button type="primary" icon={<PlusOutlined />} onClick={() => showEditModal()}>新增物料</Button>
                    <Dropdown overlay={moreMenu}><Button icon={<MoreOutlined />}>更多</Button></Dropdown>
                </Space>
            </div>
        );
    };

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                {renderToolbar()}
            </div>
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={materials}
                    rowSelection={rowSelection}
                    pagination={false}
                    sticky
                    size="small"
                    loading={loading && materials.length === 0}
                    onChange={handleTableChange}
                    onRow={(record) => ({ onClick: () => { if (!window.getSelection().toString()) setSelectedRowKeys([record.id]); } })}
                    footer={() => (
                        <>
                            {loading && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>)}
                            {!loading && !hasMore && materials.length > 0 && (<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>)}
                        </>
                    )}
                />
            </div>

            <Modal title={uiState.editingMaterial ? '编辑物料' : '新增物料'} open={uiState.isModalVisible} onOk={handleModalOk} onCancel={() => dispatch({ type: 'HIDE_ALL' })} destroyOnClose>
                <Form form={form} layout="vertical">
                    <Form.Item name="material_code" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="name" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
                    <Form.Item name="alias" label="别名"><Input /></Form.Item>
                    <Form.Item name="spec" label="规格描述"><Input.TextArea /></Form.Item>
                    <Form.Item name="category" label="物料属性" rules={[{ required: true }]}><Select>{['自制', '外购', '委外', '虚拟'].map(c => <Option key={c} value={c}>{c}</Option>)}</Select></Form.Item>
                    <Form.Item name="unit" label="单位" rules={[{ required: true }]}><Select showSearch>{units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}</Select></Form.Item>
                    <Form.Item name="supplier" label="供应商"><Select showSearch>{suppliers.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}</Select></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
                </Form>
            </Modal>

            <Modal title="批量导入物料" open={uiState.isImportModalVisible} onCancel={() => dispatch({ type: 'HIDE_ALL' })} footer={null}>
                <p>文件第一行为表头，必须包含: <strong>物料编码, 产品名称</strong>。</p>
                <a href={`${api.defaults.baseURL}/materials/template`} download>下载模板文件</a>
                <br /><br />
                <Upload {...uploadProps}>
                    <Button icon={<UploadOutlined />} style={{ width: '100%' }} loading={uiState.uploading}>
                        {uiState.uploading ? '上传中...' : '选择文件并开始导入'}
                    </Button>
                </Upload>
            </Modal>

            {uiState.bomDrawer.visible && <BomManagerDrawer visible={uiState.bomDrawer.visible} onClose={() => dispatch({ type: 'HIDE_ALL' })} material={uiState.bomDrawer.material} initialVersionId={uiState.bomDrawer.versionId} />}
            {uiState.drawingDrawer.visible && <DrawingManagerDrawer visible={uiState.drawingDrawer.visible} onClose={() => dispatch({ type: 'HIDE_ALL' })} material={uiState.drawingDrawer.material} />}
            {uiState.whereUsedModal.visible && <WhereUsedModal visible={uiState.whereUsedModal.visible} onCancel={() => dispatch({ type: 'HIDE_ALL' })} material={uiState.whereUsedModal.material} onJumpToBom={handleJumpToBom} />}
        </div>
    );
};

export default MaterialList;