import React, { useState, useEffect, useCallback } from 'react';
import { Table, Button, Input, Modal, Form, message, Popconfirm, Space, Spin, Upload } from 'antd';
import { UploadOutlined } from '@ant-design/icons';
import InfiniteScroll from 'react-infinite-scroll-component';
import api from '../api';
import BomManagerDrawer from './BomManagerDrawer';

const MaterialList = () => {
    // ... 其他 state 保持不变 ...
    const [materials, setMaterials] = useState([]);
    const [loading, setLoading] = useState(false);
    const [page, setPage] = useState(1);
    const [hasMore, setHasMore] = useState(true);
    const [selectedRowKeys, setSelectedRowKeys] = useState([]);

    const [isModalVisible, setIsModalVisible] = useState(false);
    const [editingMaterial, setEditingMaterial] = useState(null);
    const [form] = Form.useForm();

    const [isImportModalVisible, setIsImportModalVisible] = useState(false);
    const [uploading, setUploading] = useState(false);

    const [bomDrawerVisible, setBomDrawerVisible] = useState(false);
    const [selectedMaterialForBom, setSelectedMaterialForBom] = useState(null);

    // ... 其他函数保持不变 ...
    const fetchMaterials = useCallback(async (currentPage, searchValue = '') => {
        if (loading && currentPage > 1) return;
        setLoading(true);
        try {
            const response = await api.get('/materials', {
                params: { page: currentPage, limit: 30, search: searchValue }
            });
            const { data, hasMore: newHasMore } = response.data;
            setMaterials(prev => currentPage === 1 ? data : [...prev, ...data]);
            setHasMore(newHasMore);
            if (currentPage === 1) {
                setPage(2);
            } else {
                setPage(prev => prev + 1);
            }
        } catch (error) {
            message.error('加载物料列表失败');
        } finally {
            setLoading(false);
        }
    }, [loading]);

    useEffect(() => {
        fetchMaterials(1);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const handleSearch = (value) => {
        setMaterials([]);
        setSelectedRowKeys([]);
        setHasMore(true);
        fetchMaterials(1, value);
    };

    const showModal = (material = null) => {
        setEditingMaterial(material);
        form.setFieldsValue(material || {
            material_code: '', name: '', alias: '', spec: '', category: '', unit: '', supplier: '', remark: ''
        });
        setIsModalVisible(true);
    };

    const handleCancel = () => {
        setIsModalVisible(false);
        setEditingMaterial(null);
        form.resetFields();
    };

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
            handleSearch('');
        } catch (errorInfo) {
            message.error('操作失败，请检查物料编码是否重复或网络连接');
        }
    };

    const handleEdit = () => {
        const materialToEdit = materials.find(m => m.id === selectedRowKeys[0]);
        if (materialToEdit) {
            showModal(materialToEdit);
        }
    };

    const handleDelete = async () => {
        try {
            await api.post('/materials/delete', { ids: selectedRowKeys });
            message.success('物料删除成功');
            setSelectedRowKeys([]);
            handleSearch('');
        } catch (error) {
            message.error('删除失败，可能存在网络问题或物料被引用');
        }
    };

    const handleViewBom = () => {
        const material = materials.find(m => m.id === selectedRowKeys[0]);
        if (material) {
            setSelectedMaterialForBom(material);
            setBomDrawerVisible(true);
        }
    };

    const handleImportCancel = () => {
        setIsImportModalVisible(false);
    };

    const uploadProps = {
        name: 'file',
        action: 'http://localhost:5000/api/materials/import',
        accept: '.xlsx, .xls',
        showUploadList: false,
        beforeUpload: (file) => {
            const isExcel = file.type === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || file.type === 'application/vnd.ms-excel';
            if (!isExcel) {
                message.error('您只能上传 .xlsx 或 .xls 文件!');
            }
            return isExcel || Upload.LIST_IGNORE;
        },
        onChange(info) {
            if (info.file.status === 'uploading') {
                setUploading(true);
                return;
            }
            setUploading(false);
            if (info.file.status === 'done') {
                setIsImportModalVisible(false);
                message.success(info.file.response.message || `${info.file.name} 文件上传成功`);
                handleSearch('');
            } else if (info.file.status === 'error') {
                message.error(info.file.response?.error || `${info.file.name} 文件上传失败。`);
            }
        },
    };

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

    const rowSelection = {
        selectedRowKeys,
        onChange: (keys) => setSelectedRowKeys(keys),
    };


    return (
        <div style={{ height: 'calc(100vh - 65px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '16px 24px', borderBottom: '1px solid #f0f0f0', background: '#fff' }}>
                <Space>
                    <Input.Search
                        placeholder="搜索物料编号、名称或别名"
                        onSearch={handleSearch}
                        style={{ width: 300 }}
                        allowClear
                    />
                    <Button type="primary" onClick={() => showModal()}>新增物料</Button>
                    <Button onClick={() => setIsImportModalVisible(true)} icon={<UploadOutlined />}>
                        批量导入
                    </Button>
                    <Button onClick={handleEdit} disabled={selectedRowKeys.length !== 1}>
                        编辑
                    </Button>
                    <Popconfirm
                        title={`确定要删除选中的 ${selectedRowKeys.length} 个物料吗?`}
                        onConfirm={handleDelete}
                        okText="是"
                        cancelText="否"
                        disabled={selectedRowKeys.length === 0}
                    >
                        <Button danger disabled={selectedRowKeys.length === 0}>
                            删除
                        </Button>
                    </Popconfirm>
                    <Button onClick={handleViewBom} disabled={selectedRowKeys.length !== 1}>
                        查看BOM
                    </Button>
                </Space>
            </div>

            <div id="scrollableDiv" style={{ flex: 1, overflow: 'auto' }}>
                <InfiniteScroll
                    dataLength={materials.length}
                    next={() => fetchMaterials(page)}
                    hasMore={hasMore}
                    loader={<div style={{ textAlign: 'center', padding: '20px' }}><Spin /> 加载中...</div>}
                    endMessage={<div style={{ textAlign: 'center', padding: '20px', color: '#999' }}>没有更多数据了</div>}
                    scrollableTarget="scrollableDiv"
                >
                    <Table
                        rowKey="id"
                        columns={columns}
                        dataSource={materials}
                        rowSelection={rowSelection}
                        pagination={false}
                        sticky
                    />
                </InfiniteScroll>
            </div>

            {/* Modal for Add/Edit Material */}
            <Modal
                title={editingMaterial ? '编辑物料' : '新增物料'}
                open={isModalVisible}
                onOk={handleOk}
                onCancel={handleCancel}
                destroyOnClose
                width={600}
            >
                <Form form={form} layout="vertical" name="material_form">
                    <Form.Item name="material_code" label="物料编码" rules={[{ required: true, message: '请输入物料编码!' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="name" label="产品名称" rules={[{ required: true, message: '请输入产品名称!' }]}>
                        <Input />
                    </Form.Item>
                    <Form.Item name="alias" label="别名"><Input /></Form.Item>
                    <Form.Item name="spec" label="规格描述"><Input /></Form.Item>
                    <Form.Item name="category" label="物料属性"><Input /></Form.Item>
                    <Form.Item name="unit" label="单位"><Input /></Form.Item>
                    <Form.Item name="supplier" label="供应商"><Input /></Form.Item>
                    <Form.Item name="remark" label="备注"><Input.TextArea rows={2} /></Form.Item>
                </Form>
            </Modal>

            <Modal
                title="批量导入物料"
                open={isImportModalVisible}
                onCancel={handleImportCancel}
                footer={[ <Button key="back" onClick={handleImportCancel}>关闭</Button> ]}
            >
                <p>请上传符合格式要求的Excel文件 (.xlsx, .xls)。文件第一行为表头，且必须包含: <strong>物料编码, 产品名称</strong>。</p>
                <p>可选表头: <strong>别名, 规格描述, 物料属性, 单位, 供应商, 备注</strong>。</p>
                <br/>
                <Space direction="vertical" style={{ width: '100%' }}>
                    {/* 修改此处的 a 标签，使其指向后端API */}
                    <a href="http://localhost:5000/api/materials/template" download>下载模板文件</a>
                    <Upload {...uploadProps}>
                        <Button icon={<UploadOutlined />} style={{width: '100%'}} loading={uploading}>
                            {uploading ? '正在上传...' : '点击选择文件并开始上传'}
                        </Button>
                    </Upload>
                </Space>
            </Modal>

            {selectedMaterialForBom && (
                <BomManagerDrawer
                    visible={bomDrawerVisible}
                    onClose={() => setBomDrawerVisible(false)}
                    material={selectedMaterialForBom}
                />
            )}
        </div>
    );
};

export default MaterialList;