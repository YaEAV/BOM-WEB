import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Drawer, Button, List, Space, Popconfirm, message, Typography, Divider, Table, Modal, Form, Input, InputNumber, Select, Spin } from 'antd';
import { PlusOutlined, DownloadOutlined } from '@ant-design/icons';
import api from '../api';

const { Title, Text } = Typography;
const { Option } = Select;

//
// 子组件：用于新增/编辑BOM行的模态框
//
const BomLineModal = ({ visible, onCancel, onOk, editingLine, versionId, parentId }) => {
    const [form] = Form.useForm();
    const [searching, setSearching] = useState(false);
    const [searchedMaterials, setSearchedMaterials] = useState([]);
    const debounceTimeout = useRef(null);

    // 当模态框可见或编辑的行变化时，设置表单初始值
    useEffect(() => {
        if (visible) {
            if (editingLine) {
                form.setFieldsValue(editingLine);
                // 如果是编辑，需要把子件信息预置到搜索列表里，以便回显
                setSearchedMaterials([{
                    id: editingLine.component_id,
                    material_code: editingLine.component_code,
                    name: editingLine.component_name
                }]);
            } else {
                form.resetFields();
                setSearchedMaterials([]);
            }
        }
    }, [visible, editingLine, form]);

    const handleSearch = (value) => {
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        if (!value) {
            setSearchedMaterials([]);
            return;
        }

        setSearching(true);
        debounceTimeout.current = setTimeout(async () => {
            try {
                const response = await api.get('/materials/search', { params: { term: value } });
                setSearchedMaterials(response.data);
            } catch (error) {
                message.error('搜索物料失败');
            } finally {
                setSearching(false);
            }
        }, 500); // 500ms防抖
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            const payload = {
                ...values,
                version_id: versionId,
                parent_line_id: parentId || null,
                level: parentId ? 2 : 1 // 简单实现二级BOM
            };
            onOk(payload, editingLine?.id);
        } catch (error) {
            console.log('Validation Failed:', error);
        }
    };

    return (
        <Modal
            title={editingLine ? '编辑BOM行' : '新增BOM行'}
            open={visible}
            onCancel={onCancel}
            onOk={handleModalOk}
            destroyOnClose
            width={600}
        >
            <Form form={form} layout="vertical">
                <Form.Item name="position_code" label="位置编号">
                    <Input />
                </Form.Item>
                <Form.Item name="component_id" label="子件" rules={[{ required: true, message: '请选择一个子件!' }]}>
                    <Select
                        showSearch
                        placeholder="搜索物料编码或名称"
                        onSearch={handleSearch}
                        filterOption={false}
                        notFoundContent={searching ? <Spin size="small" /> : '无匹配结果'}
                    >
                        {searchedMaterials.map(d => <Option key={d.id} value={d.id}>{d.material_code} - {d.name}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="quantity" label="用量" rules={[{ required: true, message: '请输入用量!' }]}>
                    <InputNumber min={0.000001} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="process_info" label="工艺说明">
                    <Input />
                </Form.Item>
                <Form.Item name="remark" label="备注">
                    <Input.TextArea />
                </Form.Item>
            </Form>
        </Modal>
    );
};


//
// 主组件：BOM管理抽屉
//
const BomManagerDrawer = ({ visible, onClose, material }) => {
    // Versions State
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [loadingVersions, setLoadingVersions] = useState(false);

    // Lines State
    const [bomLines, setBomLines] = useState([]);
    const [loadingLines, setLoadingLines] = useState(false);

    // Modal State
    const [isLineModalVisible, setIsLineModalVisible] = useState(false);
    const [editingLine, setEditingLine] = useState(null);
    const [currentParentId, setCurrentParentId] = useState(null);

    // Export State
    const [exporting, setExporting] = useState(false);

    // --- Data Fetching Callbacks ---
    const fetchVersions = useCallback(async () => {
        if (!material) return;
        setLoadingVersions(true);
        try {
            const response = await api.get(`/versions/material/${material.id}`);
            setVersions(response.data);
            const activeVersion = response.data.find(v => v.is_active);
            if (activeVersion) { setSelectedVersion(activeVersion); }
            else if (response.data.length > 0) { setSelectedVersion(response.data[0]); }
            else { setSelectedVersion(null); }
        } catch (error) { message.error('加载BOM版本失败'); }
        finally { setLoadingVersions(false); }
    }, [material]);

    const fetchBomLines = useCallback(async () => {
        if (!selectedVersion) { setBomLines([]); return; }
        setLoadingLines(true);
        try {
            const response = await api.get(`/lines/version/${selectedVersion.id}`);
            setBomLines(response.data);
        } catch (error) { message.error('加载BOM清单失败'); }
        finally { setLoadingLines(false); }
    }, [selectedVersion]);

    useEffect(() => { if (visible) fetchVersions(); }, [visible, fetchVersions]);
    useEffect(() => { fetchBomLines(); }, [fetchBomLines]);

    // --- Handlers for BOM Versions ---
    const handleAddVersion = async () => {
        const versionCode = prompt("请输入新版本号:", "V1.0");
        if (versionCode && material) {
            try {
                await api.post('/versions', { material_id: material.id, version_code: versionCode, remark: '新版本' });
                message.success('新版本创建成功');
                fetchVersions();
            } catch (error) { message.error('创建失败，可能版本号已存在'); }
        }
    };

    const handleVersionDelete = async (versionId) => {
        try {
            await api.delete(`/versions/${versionId}`);
            message.success('BOM版本删除成功');
            fetchVersions();
        } catch (error) { message.error('删除失败'); }
    };

    // --- Handlers for BOM Lines Modal ---
    const handleOpenLineModal = (line = null, parentId = null) => {
        setEditingLine(line);
        setCurrentParentId(parentId);
        setIsLineModalVisible(true);
    };

    const handleLineModalOk = async (values, lineId) => {
        try {
            if (lineId) { // Editing
                await api.put(`/lines/${lineId}`, values);
                message.success('BOM行更新成功');
            } else { // Creating
                await api.post('/lines', values);
                message.success('BOM行新增成功');
            }
            setIsLineModalVisible(false);
            fetchBomLines(); // Refresh the list
        } catch (error) {
            message.error('操作失败');
        }
    };

    const handleLineDelete = async (lineId) => {
        try {
            await api.delete(`/lines/${lineId}`);
            message.success('BOM行删除成功');
            fetchBomLines(); // Refresh the list
        } catch (error) {
            message.error('删除失败');
        }
    };

    // --- Handler for Excel Export ---
    const handleExportExcel = async () => {
        if (!selectedVersion) {
            message.warning('请先选择一个BOM版本');
            return;
        }
        setExporting(true);
        try {
            const response = await api.get(`/lines/export/${selectedVersion.id}`, {
                responseType: 'blob', // Important: expect a binary file
            });

            const contentDisposition = response.headers['content-disposition'];
            let fileName = `BOM_${selectedVersion.version_code}.xlsx`;
            if (contentDisposition) {
                const fileNameMatch = contentDisposition.match(/filename="(.+)"/);
                if (fileNameMatch && fileNameMatch.length === 2) fileName = fileNameMatch[1];
            }

            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', fileName);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            window.URL.revokeObjectURL(url);

        } catch (error) {
            message.error('导出失败，该版本可能没有BOM数据');
        } finally {
            setExporting(false);
        }
    };

    // --- Table Column Definition ---
    const bomLineColumns = [
        { title: '位置编号', dataIndex: 'position_code', key: 'position_code', width: 120 },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150 },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name' },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec' },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        { title: '工艺说明', dataIndex: 'process_info', key: 'process_info' },
        {
            title: '操作',
            key: 'action',
            fixed: 'right',
            width: 150,
            render: (_, record) => (
                <Space size="small">
                    <a onClick={() => handleOpenLineModal(record)}>编辑</a>
                    <Popconfirm title="确定删除此行吗?" onConfirm={() => handleLineDelete(record.id)}>
                        <a>删除</a>
                    </Popconfirm>
                    {record.level === 1 && (
                        <a onClick={() => handleOpenLineModal(null, record.id)}>添加子项</a>
                    )}
                </Space>
            ),
        },
    ];

    return (
        <>
            <Drawer
                title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>}
                width={'70%'}
                onClose={onClose}
                open={visible}
                destroyOnClose
            >
                <Title level={5}>BOM 版本</Title>
                <Button onClick={handleAddVersion} type="primary" size="small" icon={<PlusOutlined />} style={{ marginBottom: 16 }}>新增版本</Button>
                <List
                    loading={loadingVersions}
                    dataSource={versions}
                    renderItem={item => (
                        <List.Item
                            actions={[
                                <Popconfirm title="确定删除此版本吗?" onConfirm={() => handleVersionDelete(item.id)}><a>删除</a></Popconfirm>
                            ]}
                            style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: selectedVersion?.id === item.id ? '#e6f7ff' : 'transparent' }}
                            onClick={() => setSelectedVersion(item)}
                        >
                            <List.Item.Meta title={<Space>{item.version_code} {item.is_active && <Text type="success">(当前激活)</Text>}</Space>} description={item.remark} />
                        </List.Item>
                    )}
                />
                <Divider />
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Title level={5} style={{ margin: 0 }}>BOM 结构 (版本: {selectedVersion?.version_code || 'N/A'})</Title>
                    <Space>
                        <Button
                            onClick={handleExportExcel}
                            icon={<DownloadOutlined />}
                            disabled={!selectedVersion || bomLines.length === 0 || exporting}
                            loading={exporting}
                        >
                            导出Excel
                        </Button>
                        <Button onClick={() => handleOpenLineModal()} type="primary" icon={<PlusOutlined />} disabled={!selectedVersion}>
                            添加根物料
                        </Button>
                    </Space>
                </Space>
                <Table
                    columns={bomLineColumns}
                    dataSource={bomLines}
                    loading={loadingLines}
                    rowKey="id"
                    pagination={false}
                    size="small"
                />
            </Drawer>

            {/* Render the modal only when it's supposed to be visible */}
            {isLineModalVisible && (
                <BomLineModal
                    visible={isLineModalVisible}
                    onCancel={() => setIsLineModalVisible(false)}
                    onOk={handleLineModalOk}
                    editingLine={editingLine}
                    versionId={selectedVersion?.id}
                    parentId={currentParentId}
                />
            )}
        </>
    );
};

export default BomManagerDrawer;