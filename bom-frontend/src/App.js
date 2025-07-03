// src/App.js (最终修正版)
import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, useLocation } from 'react-router-dom';
import { App as AntApp, Layout, Menu, Typography } from 'antd';
import { AppstoreOutlined, SettingOutlined } from '@ant-design/icons';
import MaterialList from './pages/MaterialList';
import SupplierList from './pages/SupplierList';
import UnitList from './pages/UnitList';
import VersionList from './pages/VersionList';
import { setupInterceptors } from './api'; // 导入拦截器设置函数

const { Header, Content, Sider } = Layout;
const { Title } = Typography;

// 一个内部组件，它只会在应用首次挂载时运行一次，用于初始化拦截器
const AppInitializer = ({ children }) => {
    // 使用 antd 的 hook 获取可以感知上下文的 message, notification, modal 实例
    const staticFunction = AntApp.useApp();

    useEffect(() => {
        // 将这些实例传递给我们的 API 拦截器设置函数
        // 空依赖数组 [] 确保这个 effect 只运行一次
        setupInterceptors(staticFunction);
    }, []); // 关键：空依赖数组确保只运行一次

    return children;
};


const App = () => (
    // 使用 AntApp 组件包裹整个应用，为 AppInitializer 提供上下文
    <Router>
        <AntApp>
            <AppInitializer>
                <Layout style={{ minHeight: '100vh' }}>
                    <Sider collapsible>
                        <div style={{ height: '32px', margin: '16px', textAlign: 'center' }}>
                            <Title level={4} style={{ color: 'white', margin: 0, lineHeight: '32px' }}>BOM-WEB</Title>
                        </div>
                        <AppMenu />
                    </Sider>
                    <Layout>
                        <Header style={{ background: '#fff', padding: 0, display: 'flex', alignItems: 'center' }}>
                            <PageTitle />
                        </Header>
                        <Content style={{ margin: '0 16px' }}>
                            <div style={{ padding: 24, minHeight: 360, background: '#fff', marginTop: 16 }}>
                                <Routes>
                                    <Route path="/" element={<MaterialList />} />
                                    <Route path="/materials" element={<MaterialList />} />
                                    <Route path="/versions" element={<VersionList />} />
                                    <Route path="/suppliers" element={<SupplierList />} />
                                    <Route path="/units" element={<UnitList />} />
                                </Routes>
                            </div>
                        </Content>
                    </Layout>
                </Layout>
            </AppInitializer>
        </AntApp>
    </Router>
);

const AppMenu = () => {
    const location = useLocation();
    const items = [
        { key: 'main', icon: <AppstoreOutlined />, label: 'BOM管理', children: [
                { key: '/materials', label: <Link to="/materials">物料列表</Link> },
                { key: '/versions', label: <Link to="/versions">BOM版本列表</Link> },
            ]},
        { key: 'settings', icon: <SettingOutlined />, label: '基础数据', children: [
                { key: '/suppliers', label: <Link to="/suppliers">供应商管理</Link> },
                { key: '/units', label: <Link to="/units">单位管理</Link> },
            ]},
    ];
    const openKey = items.find(item => item.children?.some(child => child.key === location.pathname))?.key;
    return <Menu theme="dark" mode="inline" items={items} defaultOpenKeys={openKey ? [openKey] : []} selectedKeys={[location.pathname]} />;
};

const PageTitle = () => {
    const location = useLocation();
    let title = '物料列表';
    if (location.pathname.startsWith('/versions')) title = 'BOM版本列表';
    else if (location.pathname.startsWith('/suppliers')) title = '供应商管理';
    else if (location.pathname.startsWith('/units')) title = '单位管理';
    return <h2 style={{ margin: '0 0 0 24px', lineHeight: '64px' }}>{title}</h2>;
};

export default App;