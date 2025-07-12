import React, { useEffect } from 'react';
import { Modal, Form, Input, Select } from 'antd';
import { useAppData } from '../context/AppContext';

const { Option } = Select;

const MaterialModal = ({ visible, onCancel, onOk, editingMaterial }) => {
    const [form] = Form.useForm();
    const { suppliers, units } = useAppData();

    useEffect(() => {
        if (visible) {
            form.setFieldsValue(editingMaterial || { category: '外购' });
        }
    }, [visible, editingMaterial, form]);

    const handleOk = () => {
        form.validateFields().then(values => {
            onOk(values);
        }).catch(info => {
            console.log('Validate Failed:', info);
        });
    };

    return (
        <Modal
            title={editingMaterial ? '编辑物料' : '新增物料'}
            open={visible}
            onOk={handleOk}
            onCancel={onCancel}
            destroyOnClose
        >
            <Form form={form} layout="vertical">
                <Form.Item name="material_code" label="物料编码" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="name" label="产品名称" rules={[{ required: true }]}><Input /></Form.Item>
                <Form.Item name="spec" label="规格描述"><Input.TextArea /></Form.Item>
                <Form.Item name="category" label="物料属性" rules={[{ required: true }]} initialValue="外购">
                    <Select>
                        <Option value="自制">自制</Option>
                        <Option value="外购">外购</Option>
                        <Option value="虚拟">虚拟</Option>
                    </Select>
                </Form.Item>
                <Form.Item name="unit" label="单位" rules={[{ required: true }]}>
                    <Select showSearch filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
                        {units.map(u => <Option key={u.id} value={u.name}>{u.name}</Option>)}
                    </Select>
                </Form.Item>
                <Form.Item name="supplier" label="供应商">
                    <Select showSearch filterOption={(input, option) => option.children.toLowerCase().includes(input.toLowerCase())}>
                        {suppliers.map(s => <Option key={s.id} value={s.name}>{s.name}</Option>)}
                    </Select>
                </Form.Item>
            </Form>
        </Modal>
    );
};

export default MaterialModal;