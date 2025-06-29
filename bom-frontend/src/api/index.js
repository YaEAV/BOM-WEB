import axios from 'axios';

// 动态确定API基础URL
const getBaseUrl = () => {
    if (process.env.NODE_ENV === 'development') {
        // 动态地使用当前页面的协议、主机名和指定的后端端口
        const protocol = window.location.protocol;
        const hostname = window.location.hostname;
        const port = 52026; // 您的后端端口
        return `${protocol}//${hostname}:${port}/api`;
    }
    return '/api';
};

const apiClient = axios.create({
    baseURL: getBaseUrl(),
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;