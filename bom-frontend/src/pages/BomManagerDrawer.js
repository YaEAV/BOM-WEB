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

    useEffect(() => {
        if (visible) {
            if (editingLine) {
                form.setFieldsValue(editingLine);
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
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
        if (!value) { setSearchedMaterials([]); return; }
        setSearching(true);
        debounceTimeout.current = setTimeout(async () => {
            try {
                const response = await api.get('/materials/search', { params: { term: value } });
                setSearchedMaterials(response.data);
            } catch (error) { message.error('搜索物料失败'); }
            finally { setSearching(false); }
        }, 500);
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            const payload = { ...values, version_id: versionId, parent_line_id: parentId || null };
            onOk(payload, editingLine?.id);
        } catch (error) { console.log('Validation Failed:', error); }
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
                <Form.Item name="position_code" label="位置编号"><Input /></Form.Item>
                <Form.Item name="component_id" label="子件" rules={[{ required: true, message: '请选择一个子件!' }]}>
                    <Select showSearch placeholder="搜索物料编码或名称" onSearch={handleSearch} filterOption={false} notFoundContent={searching ? <Spin size="small" /> : '无匹配结果'}>
                        {searchedMaterials.map(d => <Option key={d.id} value={d.id}>{d.material_code} - {d.name}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="quantity" label="用量" rules={[{ required: true, message: '请输入用量!' }]}><InputNumber min={0.000001} style={{ width: '100%' }} /></Form.Item>
                <Form.Item name="process_info" label="工艺说明"><Input /></Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
            </Form>
        </Modal>
    );
};

//
// 子组件：用于新增BOM版本的模态框 (现在支持子组件)
//
const AddVersionModal = ({ visible, onCancel, onOk, targetMaterial }) => {
    const [form] = Form.useForm();
    useEffect(() => { if (visible) form.resetFields(); }, [visible, form]);
    const handleOk = () => form.validateFields().then(values => onOk(values)).catch(info => console.log('Validate Failed:', info));
    return (
        <Modal title="新增BOM版本" open={visible} onCancel={onCancel} onOk={handleOk} destroyOnClose>
            <Form form={form} layout="vertical">
                <Form.Item label="物料编码"><Input value={targetMaterial?.material_code || targetMaterial?.component_code} disabled /></Form.Item>
                <Form.Item name="version_suffix" label="版本号后缀" rules={[{ required: true, message: '请输入版本号后缀, 例如: 1.0' }]} help="最终版本号将是: 物料编码_V(后缀)">
                    <Input placeholder="例如: 1.0" />
                </Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea rows={4} placeholder="请输入备注信息" /></Form.Item>
            </Form>
        </Modal>
    );
};

//
// 主组件：BOM管理抽屉
//
const BomManagerDrawer = ({ visible, onClose, material }) => {
    const [versions, setVersions] = useState([]);
    const [selectedVersion, setSelectedVersion] = useState(null);
    const [loadingVersions, setLoadingVersions] = useState(false);
    const [bomLines, setBomLines] = useState([]);
    const [loadingLines, setLoadingLines] = useState(false);
    const [isLineModalVisible, setIsLineModalVisible] = useState(false);
    const [editingLine, setEditingLine] = useState(null);
    const [lineModalContext, setLineModalContext] = useState({ versionId: null, parentId: null });
    const [isVersionModalVisible, setIsVersionModalVisible] = useState(false);
    const [versionTarget, setVersionTarget] = useState(null);
    const [exporting, setExporting] = useState(false);

    const fetchVersions = useCallback(async () => {
        if (!material) return;
        setLoadingVersions(true);
        try {
            const response = await api.get(`/versions/material/${material.id}`);
            setVersions(response.data);
            const activeVersion = response.data.find(v => v.is_active);
            if (activeVersion) setSelectedVersion(activeVersion);
            else if (response.data.length > 0) setSelectedVersion(response.data[0]);
            else setSelectedVersion(null);
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

    const handleAddVersion = async (values) => {
        const isSubComponent = versionTarget && versionTarget.component_id;
        const target = isSubComponent ? { id: versionTarget.component_id, material_code: versionTarget.component_code } : material;
        if (!target) return;
        const { version_suffix, remark } = values;
        const fullVersionCode = `${target.material_code}_V${version_suffix}`;
        try {
            const response = await api.post('/versions', { material_id: target.id, version_code: fullVersionCode, remark: remark || '' });
            message.success('新版本创建成功');
            setIsVersionModalVisible(false);
            if (isSubComponent) {
                const newVersionId = response.data.id;
                setVersionTarget(null);
                await fetchBomLines();
                handleOpenLineModal(null, null, newVersionId);
            } else {
                fetchVersions();
            }
        } catch (error) { message.error(error.response?.data?.error || '创建失败，可能版本号已存在'); }
    };

    const handleVersionDelete = async (versionId) => {
        try {
            await api.delete(`/versions/${versionId}`);
            message.success('BOM版本删除成功');
            fetchVersions();
        } catch (error) { message.error('删除失败'); }
    };

    const handleOpenLineModal = (line = null, parentId = null, versionId = null) => {
        setEditingLine(line);
        setLineModalContext({
            versionId: versionId || selectedVersion?.id,
            parentId: parentId
        });
        setIsLineModalVisible(true);
    };

    const handleLineModalOk = async (values, lineId) => {
        try {
            if (lineId) {
                await api.put(`/lines/${lineId}`, values);
                message.success('BOM行更新成功');
            } else {
                await api.post('/lines', values);
                message.success('BOM行新增成功');
            }
            setIsLineModalVisible(false);
            fetchBomLines();
        } catch (error) { message.error('操作失败'); }
    };

    const handleLineDelete = async (lineId) => {
        try {
            await api.delete(`/lines/${lineId}`);
            message.success('BOM行删除成功');
            fetchBomLines();
        } catch (error) { message.error('删除失败'); }
    };

    const handleAddSubItem = (record) => {
        if (record.component_active_version_id) {
            handleOpenLineModal(null, null, record.component_active_version_id);
        } else {
            setVersionTarget(record);
            setIsVersionModalVisible(true);
        }
    };

    const handleExportExcel = async () => { /* ... 导出逻辑不变 ... */ };

    const destroyOnHidden = [
        { title: '层级', dataIndex: 'level', key: 'level', width: 80 },
        { title: '位置编号', dataIndex: 'position_code', key: 'position_code', width: 120 },
        { title: '子件编码', dataIndex: 'component_code', key: 'component_code', width: 150 },
        { title: '子件名称', dataIndex: 'component_name', key: 'component_name' },
        { title: '规格', dataIndex: 'component_spec', key: 'component_spec' },
        { title: '用量', dataIndex: 'quantity', key: 'quantity', width: 100 },
        {
            title: '操作', key: 'action', fixed: 'right', width: 180,
            render: (_, record) => (
                <Space size="small">
                    <a onClick={() => handleOpenLineModal(record)}>编辑</a>
                    <Popconfirm title="确定删除此行吗?" onConfirm={() => handleLineDelete(record.id)}><a>删除</a></Popconfirm>
                    <a onClick={() => handleAddSubItem(record)}>添加子项</a>
                </Space>
            ),
        },
    ];

    return (
        <>
            <Drawer title={<>BOM 管理: <Text strong>{material?.name}</Text> (<Text type="secondary">{material?.material_code}</Text>)</>} width={'70%'} onClose={onClose} open={visible} destroyOnClose>
                <Title level={5}>BOM 版本</Title>
                <Button onClick={() => { setVersionTarget(material); setIsVersionModalVisible(true); }} type="primary" size="small" icon={<PlusOutlined />} style={{ marginBottom: 16 }}>新增版本</Button>
                <List
                    loading={loadingVersions}
                    dataSource={versions}
                    renderItem={item => (
                        <List.Item actions={[<Popconfirm title="确定删除此版本吗?" onConfirm={() => handleVersionDelete(item.id)}><a>删除</a></Popconfirm>]} style={{ cursor: 'pointer', padding: '8px 16px', backgroundColor: selectedVersion?.id === item.id ? '#e6f7ff' : 'transparent' }} onClick={() => setSelectedVersion(item)}>
                            <List.Item.Meta title={<Space>{item.version_code} {item.is_active && <Text type="success">(当前激活)</Text>}</Space>} description={item.remark || '无备注'} />
                        </List.Item>
                    )}
                />
                <Divider />
                <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
                    <Title level={5} style={{ margin: 0 }}>BOM 结构 (版本: {selectedVersion?.version_code || 'N/A'})</Title>
                    <Space>
                        <Button onClick={handleExportExcel} icon={<DownloadOutlined />} disabled={!selectedVersion || bomLines.length === 0 || exporting} loading={exporting}>导出Excel</Button>
                        <Button onClick={() => handleOpenLineModal()} type="primary" icon={<PlusOutlined />} disabled={!selectedVersion}>添加根物料</Button>
                    </Space>
                </Space>
                <Table columns={destroyOnHidden} dataSource={bomLines} loading={loadingLines} rowKey="id" pagination={false} size="small" />
            </Drawer>

            <AddVersionModal visible={isVersionModalVisible} onCancel={() => setIsVersionModalVisible(false)} onOk={handleAddVersion} targetMaterial={versionTarget} />

            {isLineModalVisible && (
                <BomLineModal visible={isLineModalVisible} onCancel={() => setIsLineModalVisible(false)} onOk={handleLineModalOk} editingLine={editingLine} versionId={lineModalContext.versionId} parentId={lineModalContext.parentId} />
            )}
        </>
    );
};

export default BomManagerDrawer;