import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, Spin, message } from 'antd';
import api from '../api';

const { Option } = Select;

const BomLineModal = ({ visible, onCancel, onOk, editingLine, versionId, parentId }) => {
    const [form] = Form.useForm();
    const [searching, setSearching] = useState(false);
    const [searchedMaterials, setSearchedMaterials] = useState([]);
    const debounceTimeout = useRef(null);

    useEffect(() => {
        if (visible) {
            if (editingLine) {
                form.setFieldsValue(editingLine);
                // 当编辑时，预填充子件选择框
                if (editingLine.component_id && editingLine.component_code && editingLine.component_name) {
                    setSearchedMaterials([{
                        id: editingLine.component_id,
                        material_code: editingLine.component_code,
                        name: editingLine.component_name
                    }]);
                }
            } else {
                form.resetFields();
                setSearchedMaterials([]);
            }
        }
    }, [visible, editingLine, form]);

    const handleSearch = (value) => {
        if (debounceTimeout.current) clearTimeout(debounceTimeout.current);
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
        }, 500);
    };

    const handleModalOk = async () => {
        try {
            const values = await form.validateFields();
            onOk({ ...values, version_id: versionId, parent_line_id: parentId || null }, editingLine?.id);
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
            destroyOnHidden
            width={600}
        >
            <Form form={form} layout="vertical">
                <Form.Item name="position_code" label="位置编号 (在当前层级)" rules={[{ required: true, message: '请输入位置编号!' }]}>
                    <Input placeholder="例如: 1, 2, A, 13KN..." />
                </Form.Item>
                <Form.Item name="component_id" label="子件" rules={[{ required: true, message: '请选择一个子件!' }]}>
                    <Select
                        showSearch
                        placeholder="搜索物料编码或名称"
                        onSearch={handleSearch}
                        filterOption={false}
                        notFoundContent={searching ? <Spin size="small" /> : '无匹配结果'}
                    >
                        {searchedMaterials.map(d => <Option key={d.id} value={d.id}>{`${d.material_code} - ${d.name}`}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="quantity" label="用量" rules={[{ required: true, message: '请输入用量!' }]}>
                    <InputNumber min={0.000001} style={{ width: '100%' }} />
                </Form.Item>
                <Form.Item name="process_info" label="工艺说明"><Input /></Form.Item>
                <Form.Item name="remark" label="备注"><Input.TextArea /></Form.Item>
            </Form>
        </Modal>
    );
};

export default BomLineModal;