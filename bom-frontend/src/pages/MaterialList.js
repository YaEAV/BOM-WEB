import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Spin, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import api from '../api';
import BomManagerDrawer from './BomManagerDrawer';

const MaterialList = () => {
    // --- State定义部分保持不变 ---
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1); // page始终代表“将要加载的下一页”
    const [hasMore, setHasMore] = useState(true);
    const [currentSearch, setCurrentSearch] = useState(''); // 用于存储当前的搜索词
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);
    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [form] = Form.useForm();
    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);
    const [bomDrawerVisible, setBomDrawerVisible] = useState(false);
    const [selectedMaterialForBom, setSelectedMaterialForBom] = useState(null);

    // --- 重构数据获取逻辑 ---
    const fetchMaterials = useCallback(async (pageToFetch, searchValue) => {
        // 防止在加载时重复请求
        if (loading) return;
        setLoading(true);

        try {
            const response = await api.get('/materials', {
                params: { page: pageToFetch, limit: 30, search: searchValue }
            });
            const { data, hasMore: newHasMore } = response.data;

            // 如果是第一页（新搜索），则替换数据；否则，追加数据
            setMaterials(prev => pageToFetch === 1 ? data : [...prev, ...data]);
            setHasMore(newHasMore);

            // 如果还有更多数据，则准备好下一页的页码
            if (newHasMore) {
                setPage(pageToFetch + 1);
            }
        } catch (error) {
            message.error('加载物料列表失败');
        } finally {
            setLoading(false);
        }
    }, [loading]); // 依赖项是 loading

    // --- 初始加载 ---
    useEffect(() => {
        fetchMaterials(1, '');
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // --- 新的搜索处理函数 ---
    const handleSearch = (value) => {
        setCurrentSearch(value); // 保存搜索词
        setPage(1);              // 重置页码
        setHasMore(true);        // 重置hasMore
        setMaterials([]);        // 立即清空现有数据
        fetchMaterials(1, value);  // 获取新数据
    };

    // --- 新的滚动处理函数 ---
    const handleScroll = (event) => {
        const target = event.currentTarget;
        const { scrollTop, scrollHeight, clientHeight } = target;

        // 滚动条触底判断（增加5px的缓冲区）
        if (scrollHeight - scrollTop <= clientHeight + 5) {
            // 如果确认还有更多数据，并且当前不处于加载状态，则加载下一页
            if (hasMore && !loading) {
                fetchMaterials(page, currentSearch);
            }
        }
    };

    // --- 其他所有UI相关的处理函数都保持不变 ---
    const showModal = (material = null) => {
        setEditingMaterial(material);
        form.setFieldsValue(material || { material_code: '', name: '', alias: '', spec: '', category: '', unit: '', supplier: '', remark: '' });
        setIsModalVisible(true);
    };
    const handleCancel = () => { setIsModalVisible(false); setEditingMaterial(null); form.resetFields(); };
    const handleOk = async () => {
        try {
            const values = await form.validateFields();
            if (editingMaterial) {
                await api.put(`/materials/${editingMaterial.id}`, values);
                message.success('物料更新成功');
            } else {
                await api.post('/materials', values);
                message.success('物料创建成功');
            }
            handleCancel();
            handleSearch(''); // 刷新
        } catch (errorInfo) { message.error('操作失败，请检查物料编码是否重复或网络连接'); }
    };
    const handleEdit = () => { const materialToEdit = materials.find(m => m.id === selectedRowKeys[0]); if (materialToEdit) showModal(materialToEdit); };
    const handleDelete = async () => { try { await api.post('/materials/delete', { ids: selectedRowKeys }); message.success('物料删除成功'); setSelectedRowKeys([]); handleSearch(''); } catch (error) { message.error('删除失败，可能存在网络问题或物料被引用'); } };
    const handleViewBom = () => { const material = materials.find(m => m.id === selectedRowKeys[0]); if (material) { setSelectedMaterialForBom(material); setBomDrawerVisible(true); } };
    const handleImportCancel = () => setIsImportModalVisible(false);
    const uploadProps = { name: 'file', action: 'http://localhost:5000/api/materials/import', accept: '.xlsx, .xls', showUploadList: false, /* ... */ };

    const columns = [
        { title: '物料编号', dataIndex: 'material_code', key: 'material_code', width: 150 },
        { title: '产品名称', dataIndex: 'name', key: 'name', width: 150 },
        { title: '别名', dataIndex: 'alias', key: 'alias', width: 150 },
        { title: '规格描述', dataIndex: 'spec', key: 'spec', width: 200 },
        { title: '物料属性', dataIndex: 'category', key: 'category', width: 120 },
        { title: '单位', dataIndex: 'unit', key: 'unit', width: 80 },
        { title: '供应商', dataIndex: 'supplier', key: 'supplier', width: 150 },
        { title: '备注', dataIndex: 'remark', key: 'remark' },
    ];
    const rowSelection = { selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) };

    return (
        <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column' }}>
            {/* 顶部操作栏 */}
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                <Space>
                    <Input.Search placeholder="搜索物料编号、名称或别名" onSearch={handleSearch} style={{ width: 300 }} allowClear />
                    <Button type="primary" onClick={() => showModal()}>新增物料</Button>
                    <Button onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />}>批量导入</Button>
                    <Button onClick={handleEdit} disabled={selectedRowKeys.length !== 1}>编辑</Button>
                    <Popconfirm title={`确定要删除选中的 ${selectedRowKeys.length} 个物料吗?`} onConfirm={handleDelete} okText="是" cancelText="否" disabled={selectedRowKeys.length === 0}>
                        <Button danger disabled={selectedRowKeys.length === 0}>删除</Button>
                    </Popconfirm>
                    <Button onClick={handleViewBom} disabled={selectedRowKeys.length !== 1}>查看BOM</Button>
                </Space>
            </div>

            {/* 为滚动容器绑定 onScroll 事件 */}
            <div id="scrollableDiv" onScroll={handleScroll} style={{ flex: 1, overflow: 'auto' }}>
                <Table
                    rowKey="id"
                    columns={columns}
                    dataSource={materials}
                    rowSelection={rowSelection}
                    pagination={false}
                    sticky
                    // 在Table之后直接渲染加载提示
                    footer={() => (
                        <>
                            {loading && (
                                <div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>
                            )}
                            {!loading && !hasMore && materials.length > 0 && (
                                <div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>
                            )}
                        </>
                    )}
                />
            </div>

            {/* Modal 和 Drawer 部分不变 */}
            <Modal title={editingMaterial ? '编辑物料' : '新增物料'} open={isModalVisible} onOk={handleOk} onCancel={handleCancel} ddestroyOnHidden width={600}>{/* ... */}</Modal>
            <Modal title="批量导入物料" open={isImportModalVisible} onCancel={handleImportCancel} footer={[<Button key="back" onClick={handleImportCancel}>关闭</Button>]}>{/* ... */}</Modal>
            {selectedMaterialForBom && (<BomManagerDrawer visible={bomDrawerVisible} onClose={() => setBomDrawerVisible(false)} material={selectedMaterialForBom} />)}
        </div>
    );
};

export default MaterialList;