// src/components/BomLineModal.js (已使用全局Context)
import React, { useState, useEffect, useRef } from 'react';
import { Modal, Form, Input, InputNumber, Select, Spin, message } from 'antd';
import api from '../api';
// 不再需要从 MaterialList 获取数据，因此无需导入 useAppData

const { Option } = Select;

const BomLineModal = ({ visible, onCancel, onOk, editingLine }) => {
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
                    setSearchedMaterials([material]);
                    form.setFieldsValue({ component_id: material.id });
                }
            } else {
                form.resetFields();
                searchedMaterialsRef.current = [];
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
            searchedMaterialsRef.current = [];
            return;
        }
        setSearching(true);
        debounceTimeout.current = setTimeout(async () => {
            try {
                // 这里的动态搜索逻辑保持不变，因为它不适合用全局状态
                const response = await api.get('/materials/search', { params: { term: value } });
                searchedMaterialsRef.current = response.data;
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
            onOk(values, editingLine);
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
                        options={searchedMaterials.map(d => ({
                            key: d.id,
                            value: d.id,
                            label: `${d.material_code} - ${d.name}`
                        }))}
                    />
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