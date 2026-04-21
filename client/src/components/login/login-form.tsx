import type React from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import GlareHover from '../GlareHover';
import { Link, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import Loading from '../Loading';
import { FaGoogle } from 'react-icons/fa';
import { getRoleHomePath } from '@/utils/routePermissions';
import { useAuth } from '@/contexts/AuthContext';
import cognitoService from '@/services/cognitoService';

export function LoginForm({
    className,
    ...props
}: React.ComponentPropsWithoutRef<'form'>) {
    const [data, setData] = useState({
        email: '',
        password: '',
    });

    const navigate = useNavigate();
    const { login, loginWithGoogle } = useAuth();
    const userRole = useSelector((state: any) => state.user.role);
    const [loading, setLoading] = useState(false);
    const [googleLoading, setGoogleLoading] = useState(false);
    const [showPassword, setShowPassword] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setData((prev) => ({ ...prev, [name]: value }));
    };

    const validateEmail = (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[a-zA-Z]{2,}$/;
        const validTLDs = [
            'com',
            'net',
            'org',
            'io',
            'co',
            'ai',
            'vn',
            'com.vn',
            'edu.vn',
            'gov.vn',
        ];
        if (!emailRegex.test(email)) return false;
        const domain = email.split('@')[1];
        const tld = domain.split('.').slice(1).join('.');
        if (!validTLDs.includes(tld)) return false;
        if (
            email.includes('..') ||
            email.startsWith('.') ||
            email.endsWith('.') ||
            email.split('@')[0].endsWith('.')
        )
            return false;
        return true;
    };

    const handleSubmit = async (e) => {
        e.preventDefault();

        if (!data.email && !data.password) {
            toast.error('Vui lòng nhập đầy đủ thông tin.');
            return;
        }
        if (!data.email) {
            toast.error('Vui lòng nhập email');
            return;
        } else if (!validateEmail(data.email)) {
            toast.error('Vui lòng nhập địa chỉ email hợp lệ');
            return;
        }
        if (!data.password) {
            toast.error('Vui lòng nhập mật khẩu');
            return;
        }

        try {
            setLoading(true);
            
            // Use Cognito authentication
            await login(data.email, data.password);
            
            toast.success('Đăng nhập thành công');
            setData({ email: '', password: '' });
            
            // Navigate to role-based home page
            navigate(getRoleHomePath(userRole));
        } catch (error) {
            console.error('Login error:', error);
            
            // Map Cognito error to Vietnamese message
            const errorMessage = cognitoService.mapCognitoError(error);
            toast.error(errorMessage);
        } finally {
            setLoading(false);
        }
    };

    const handleGoogleLogin = () => {
        try {
            setGoogleLoading(true);
            loginWithGoogle();
        } catch (error) {
            console.error('Google login error:', error);
            toast.error('Đăng nhập Google thất bại. Vui lòng thử lại.');
            setGoogleLoading(false);
        }
    };

    return (
        <form
            className={cn(
                'flex flex-col gap-6 font-semibold text-foreground',
                className
            )}
            {...props}
            onSubmit={handleSubmit}
        >
            <div className="flex flex-col items-center gap-2 text-center">
                <h1 className="text-2xl">Đăng Nhập Vào Tài Khoản</h1>
                <p className="text-balance text-sm">
                    Nhập email của bạn bên dưới để đăng nhập vào tài khoản
                </p>
            </div>
            <div className="grid gap-6 font-bold">
                <div className="grid gap-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                        id="email"
                        type="email"
                        name="email"
                        autoFocus
                        placeholder="m@example.com"
                        onChange={handleChange}
                        value={data.email}
                        className="h-12 border-muted-foreground border-2 focus:ring-0 shadow-none rounded-lg bg-white/20 focus:border-[#3F3FF3]"
                    />
                </div>
                <div className="grid gap-2">
                    <Label htmlFor="password">Mật khẩu</Label>
                    <div className="relative">
                        <Input
                            id="password"
                            type={showPassword ? 'text' : 'password'}
                            name="password"
                            placeholder="Nhập mật khẩu"
                            onChange={handleChange}
                            value={data.password}
                            className="h-12 pr-10 border-muted-foreground border-2 focus:ring-0 shadow-none rounded-lg bg-white/20 focus:border-[#3F3FF3]"
                        />
                        <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="absolute right-0 top-0 h-full px-3 py-2 hover:bg-transparent cursor-pointer"
                            onClick={() => setShowPassword(!showPassword)}
                        >
                            {showPassword ? (
                                <EyeOff className="h-4 w-4" />
                            ) : (
                                <Eye className="h-4 w-4" />
                            )}
                        </Button>
                    </div>
                </div>
                <div className="flex items-center justify-between font-semibold text-highlight">
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="remember"
                            className="rounded border-gray-300 cursor-pointer"
                        />
                        <Label
                            htmlFor="remember"
                            className="text-sm cursor-pointer hover:opacity-80"
                        >
                            Ghi nhớ đăng nhập
                        </Label>
                    </div>
                    <Link
                        to={'/forgot-password'}
                        className="p-0 h-auto text-sm hover:opacity-80 cursor-pointer"
                    >
                        Quên mật khẩu?
                    </Link>
                </div>

                <GlareHover
                    background="transparent"
                    glareOpacity={0.3}
                    glareAngle={-30}
                    glareSize={300}
                    transitionDuration={800}
                    playOnce={false}
                >
                    <Button
                        type="submit"
                        className="bg-foreground w-full h-12 font-bold"
                    >
                        {loading ? <Loading /> : 'Đăng nhập'}
                    </Button>
                </GlareHover>

                <>
                    <div className="relative text-center text-sm after:absolute after:inset-0 after:top-1/2 after:z-0 after:flex after:items-center after:border-t after:border-foreground">
                        <span className="relative z-10 bg-background px-2 py-1 rounded-md text-foreground uppercase">
                            Hoặc đăng nhập với
                        </span>
                    </div>

                    <div className="text-foreground">
                        {/* Google — Cognito Hosted UI */}
                        <Button
                            type="button"
                            variant="outline"
                            className="w-full flex items-center justify-center gap-2 h-12 border-muted-foreground border-2 rounded-lg shadow-none cursor-pointer"
                            onClick={handleGoogleLogin}
                            disabled={googleLoading}
                        >
                            {googleLoading ? (
                                <Loading />
                            ) : (
                                <>
                                    <FaGoogle className="text-red-500" />
                                    Google
                                </>
                            )}
                        </Button>
                    </div>
                </>
            </div>
            <div className="text-center text-sm">
                Bạn chưa có tài khoản?{' '}
                <Link
                    to={'/register'}
                    className="p-0 h-auto text-sm hover:opacity-80 cursor-pointer text-highlight"
                >
                    Đăng ký ngay.
                </Link>
            </div>
        </form>
    );
}
