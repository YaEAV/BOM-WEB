import axios from 'axios';

const apiClient = axios.create({
    baseURL: 'http://localhost:5000/api', // 您的后端API地址
    headers: {
        'Content-Type': 'application/json',
    },
});

export default apiClient;