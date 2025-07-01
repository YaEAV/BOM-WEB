import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, Spin, message } from 'antd';
import api from '../api';

const { Option } = Select;

const BomLineModal = ({ visible, onCancel, onOk, editingLine, versionId, parentId }) => {
    const [form] = Form.useForm();
    const [searching, setSearching] = useState(false);
    const [searchedMaterials, setSearchedMaterials] = useState([]);
    const debounceTimeout = useRef(null);
    const searchedMaterialsRef = useRef([]);

    useEffect(() => {
        if (visible) {
            if (editingLine) {
                form.setFieldsValue(editingLine);
                if (editingLine.component_id && editingLine.component_code && editingLine.component_name) {
                    const material = {
                        id: editingLine.component_id,
                        material_code: editingLine.component_code,
                        name: editingLine.component_name,
                        spec: editingLine.component_spec,
                        unit: editingLine.component_unit,
                    };
                    searchedMaterialsRef.current = [material];
                    form.setFieldsValue({ component_id: material.id });
                }
            } else {
                form.resetFields();
                searchedMaterialsRef.current = [];
            }
        }
    }, [visible, editingLine, form]);

    const handleSearch = (value) => {
        if (!value) {
            searchedMaterialsRef.current = [];
            return;
        }
        setSearching(true);
        setTimeout(async () => {
            try {
                const response = await api.get('/materials/search', { params: { term: value } });
                searchedMaterialsRef.current = response.data;
                // 强制更新让 Select 组件重新渲染
                form.setFieldsValue({ component_id: form.getFieldValue('component_id') });
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
            // ** 修改点2: 从Ref中查找选择的物料，并把物料的详细信息一起传递出去 **
            const selectedMaterial = searchedMaterialsRef.current.find(m => m.id === values.component_id);
            const fullValues = {
                ...values,
                ...(selectedMaterial && {
                    component_code: selectedMaterial.material_code,
                    component_name: selectedMaterial.name,
                    component_spec: selectedMaterial.spec,
                    component_unit: selectedMaterial.unit,
                })
            };

            onOk({ ...fullValues, version_id: versionId, parent_line_id: parentId || null }, editingLine?.id);
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
                        {searchedMaterialsRef.current.map(d => <Option key={d.id} value={d.id}>{`${d.material_code} - ${d.name}`}</Option>)}
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