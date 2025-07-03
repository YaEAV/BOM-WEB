import React, { useState, useEffect, useReducer, useCallback } from 'react';
import { App as AntApp, Table, Button, Modal, Form, Popover, Select, Spin, Upload, Typography, Input, List, Radio } from 'antd'; // 增加了 Radio
import { DownloadOutlined, UploadOutlined, EditOutlined, DeleteOutlined, PlusOutlined, FileTextOutlined, AppstoreOutlined, FileZipOutlined, SwapOutlined } from '@ant-design/icons';
import { materialService } from '../services/materialService';
import { supplierService } from '../services/supplierService';
import { unitService } from '../services/unitService';
import { useInfiniteScroll } from '../hooks/useInfiniteScroll';
import BomManagerDrawer from './BomManagerDrawer';
import DrawingManagerDrawer from './DrawingManagerDrawer';
import WhereUsedModal from '../components/WhereUsedModal';
import ListPageToolbar from '../components/ListPageToolbar';
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
    const { message: messageApi, modal: modalApi } = AntApp.useApp();
    const [uiState, dispatch] = useReducer(uiStateReducer, initialState);
    const [materialImportMode, setMaterialImportMode] = useState('overwrite'); // 新增状态来管理物料导入模式
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
            .catch(() => { /* 错误已由拦截器处理 */ });

        unitService.getUnits({ limit: 1000 })
            .then(res => setUnits(res.data.data || res.data))
            .catch(() => { /* 错误已由拦截器处理 */ });
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
                messageApi.success('更新成功');
                updateItemInData(uiState.editingMaterial.id, values);
            } else {
                await materialService.createMaterial(values);
                messageApi.success('创建成功');
                refresh();
            }
            dispatch({ type: 'HIDE_ALL' });
        } catch (error) {
            console.error("操作失败:", error);
        }
    };

    const handleDelete = async () => {
        try {
            await materialService.deleteMaterials(selectedRowKeys);
            messageApi.success(`成功删除 ${selectedRowKeys.length} 项`);
            setSelectedRowKeys([]);
            refresh();
        } catch (error) {
            console.error("删除失败:", error);
        }
    };

    const handleSelectAll = async () => {
        try {
            const response = await materialService.getAllMaterialIds(currentSearch);
            setSelectedRowKeys(response.data);
        } catch (error) {
            console.error("获取全部ID失败:", error);
        }
    };

    const handleExport = async (type) => {
        if (type === 'selected' && selectedRowKeys.length === 0) return messageApi.warning('请至少选择一项进行导出。');
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
        } catch (error) {
            console.error('导出失败:', error);
        }
        finally {
            dispatch({ type: 'SET_EXPORTING', payload: false });
        }
    };

    const handleExportActiveBomDrawings = async () => {
        if (selectedRowKeys.length !== 1) {
            messageApi.warning('请选择一个物料进行导出。');
            return;
        }
        dispatch({ type: 'SET_EXPORTING_BOM', payload: true });
        messageApi.info('正在后台为您打包该物料的激活BOM层级图纸，请稍候...');
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
            console.error('导出BOM图纸失败:', error);
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
            console.error('跳转BOM失败:', err);
        }
    }, []);

    const uploadProps = {
        name: 'file',
        action: `${api.defaults.baseURL}/materials/import?mode=${materialImportMode}`, // 动态添加 mode 参数
        accept: '.xlsx, .xls',
        showUploadList: false,
        onChange(info) {
            if (info.file.status === 'uploading') {
                dispatch({ type: 'SET_UPLOADING', payload: true });
                return;
            }
            if (info.file.status === 'done') {
                dispatch({ type: 'SET_UPLOADING', payload: false });
                dispatch({ type: 'HIDE_ALL' });
                messageApi.success(info.file.response.message || '导入成功');
                refresh();
            } else if (info.file.status === 'error') {
                dispatch({ type: 'SET_UPLOADING', payload: false });
                const errorData = info.file.response;
                // --- 关键修改：处理错误列表 ---
                if (errorData?.error?.errors && Array.isArray(errorData.error.errors)) {
                    modalApi.error({
                        title: '导入失败，存在以下错误：',
                        width: 600,
                        content: (
                            <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
                                <List
                                    dataSource={errorData.error.errors}
                                    renderItem={item => (
                                        <List.Item>
                                            <Text type="danger">{`第 ${item.row} 行: ${item.message}`}</Text>
                                        </List.Item>
                                    )}
                                />
                            </div>
                        ),
                    });
                } else {
                    let errorMessage = '导入失败';
                    if (errorData?.error) {
                        errorMessage = errorData.error.message || errorData.error;
                    }
                    messageApi.error(errorMessage);
                }
            }
        },
    };

    const columns = [
        { title: '物料编号', dataIndex: 'material_code', key: 'material_code', sorter: true, showSorterTooltip: false, width: 120, ellipsis: true, render: (text) => <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> },
        { title: '产品名称', dataIndex: 'name', key: 'name', sorter: true, showSorterTooltip: false, width: 150, ellipsis: true, render: (text) => <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> },
        { title: '别名', dataIndex: 'alias', key: 'alias', width: 120, ellipsis: true, render: (text) => <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> },
        { title: '规格描述', dataIndex: 'spec', key: 'spec', width: 300, ellipsis: true, render: (text) => <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> },
        { title: '物料属性', dataIndex: 'category', key: 'category', sorter: true, showSorterTooltip: false, width: 100 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
        { title: '供应商', dataIndex: 'supplier', key: 'supplier', sorter: true, showSorterTooltip: false, width: 120, ellipsis: true, render: (text) => <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> },
        { title: '备注', dataIndex: 'remark', key: 'remark', width: 150, ellipsis: true, render: (text) => <Popover placement="topLeft" content={<Text copyable>{text}</Text>}><span>{text}</span></Popover> },
    ];

    const rowSelection = {
        selectedRowKeys,
        onChange: setSelectedRowKeys,
        selections: [Table.SELECTION_ALL, Table.SELECTION_INVERT, Table.SELECTION_NONE, { key: 'selectAllData', text: '选择所有数据', onSelect: handleSelectAll }],
    };

    const singleSelected = selectedRowKeys.length === 1;
    const material = singleSelected ? materials.find(m => m.id === selectedRowKeys[0]) : null;

    const toolbarButtons = [
        ...(selectedRowKeys.length > 0 ? [
            { text: '编辑', icon: <EditOutlined />, onClick: () => showEditModal(material), disabled: !singleSelected },
            { text: 'BOM', icon: <AppstoreOutlined />, onClick: () => dispatch({ type: 'SHOW_BOM_DRAWER', payload: { material } }), disabled: !singleSelected },
            { text: '反查', icon: <SwapOutlined />, onClick: () => dispatch({ type: 'SHOW_WHERE_USED_MODAL', payload: { material } }), disabled: !singleSelected },
            { text: '图纸', icon: <FileTextOutlined />, onClick: () => dispatch({ type: 'SHOW_DRAWING_DRAWER', payload: { material } }), disabled: !singleSelected },
            { text: '删除', icon: <DeleteOutlined />, danger: true, isConfirm: true, confirmTitle: `确定删除选中的 ${selectedRowKeys.length} 项吗?`, onClick: handleDelete, disabled: selectedRowKeys.length === 0 },
        ] : []),
        { text: '新增物料', icon: <PlusOutlined />, type: 'primary', onClick: () => showEditModal() },
    ];

    const moreMenuItems = [
        {
            key: 'import',
            icon: <UploadOutlined />,
            label: '批量导入物料',
            onClick: () => dispatch({ type: 'SHOW_IMPORT_MODAL' }),
        },
        {
            key: 'export',
            icon: <DownloadOutlined />,
            label: '导出选中(Excel)',
            disabled: uiState.exporting || selectedRowKeys.length === 0,
            onClick: () => handleExport('selected'),
        },
        {
            type: 'divider',
        },
        {
            key: 'export-bom-drawings',
            icon: <FileZipOutlined />,
            label: '导出激活BOM图纸',
            disabled: !singleSelected || uiState.exportingBOM,
            onClick: handleExportActiveBomDrawings,
        },
    ];

    return (
        <div style={{ height: 'calc(100vh - 110px)', display: 'flex', flexDirection: 'column' }}>
            <ListPageToolbar
                searchPlaceholder="搜索物料编码、名称或别名..."
                onSearch={handleSearch}
                selectedCount={selectedRowKeys.length}
                buttons={toolbarButtons}
                moreMenuItems={moreMenuItems}
            />
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

            <Modal title={uiState.editingMaterial ? '编辑物料' : '新增物料'} open={uiState.isModalVisible} onOk={handleModalOk} onCancel={() => dispatch({ type: 'HIDE_ALL' })} destroyOnHidden>
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

            <Modal title="批量导入物料" open={uiState.isImportModalVisible} onCancel={() => dispatch({ type: 'HIDE_ALL' })} footer={null} destroyOnHidden>
                <p>文件第一行为表头，必须包含: <strong>物料编码, 产品名称, 单位</strong>。</p>
                <a href={`${api.defaults.baseURL}/materials/template`} download>下载模板文件</a>
                <br /><br />

                {/* --- 关键修改：增加导入模式选择 --- */}
                <Form.Item label="导入模式">
                    <Radio.Group onChange={(e) => setMaterialImportMode(e.target.value)} value={materialImportMode}>
                        <Radio value="overwrite"><strong>覆盖导入</strong> (更新已有物料，新增不存在的物料)</Radio>
                        <Radio value="incremental"><strong>新增导入</strong> (只新增不存在的物料，跳过已有的物料)</Radio>
                    </Radio.Group>
                </Form.Item>

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