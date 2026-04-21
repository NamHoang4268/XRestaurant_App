import axios from "axios";
import { baseURL } from "../common/SummaryApi";
import cognitoService from "../services/cognitoService";

let isLoggingOut = false;

// Hàm set flag từ bên ngoài
export const setIsLoggingOut = (value) => {
    isLoggingOut = value;
};

// Tạo instance riêng
const Axios = axios.create({
    baseURL: baseURL,
    withCredentials: true, // gửi cookie nếu có
});

// Request interceptor - inject idToken instead of accesstoken
Axios.interceptors.request.use(
    (config) => {
        const idToken = localStorage.getItem("idToken");
        if (idToken) {
            config.headers.Authorization = `Bearer ${idToken}`;
        }
        return config;
    },
    (error) => Promise.reject(error)
);

// Response interceptor - handle token refresh with Cognito
Axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        if (error.response?.status === 401 && !originalRequest._retry) {
            // Nếu là do logout thì bỏ qua, không redirect và không show toast
            if (isLoggingOut) {
                return Promise.reject({ ...error, suppressToast: true });
            }

            originalRequest._retry = true;
            try {
                const refreshToken = localStorage.getItem("refreshToken");
                if (refreshToken) {
                    // Use Cognito refresh instead of custom endpoint
                    const tokens = await cognitoService.refreshSession(refreshToken);
                    
                    if (tokens && tokens.idToken) {
                        // Update request with new token
                        originalRequest.headers.Authorization = `Bearer ${tokens.idToken}`;
                        return Axios(originalRequest);
                    }
                }
            } catch (refreshError) {
                console.error("Token refresh failed:", refreshError);
            }

            // Refresh failed - clear and redirect
            localStorage.removeItem("idToken");
            localStorage.removeItem("accessToken");
            localStorage.removeItem("refreshToken");

            // Kiểm tra nếu chưa ở trang login VÀ không phải trang Home thì mới redirect
            if (window.location.pathname !== "/login" && window.location.pathname !== "/") {
                window.location.href = "/login";
            }
        }

        return Promise.reject(error);
    }
);

export default Axios;
