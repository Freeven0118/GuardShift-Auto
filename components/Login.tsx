
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, ArrowRight, AlertCircle, Lock, Users } from 'lucide-react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);

  const CLIENT_ID = "1090811649908-ejqk8otbcs7lj0umno974s5p05lteocd.apps.googleusercontent.com"; 

  const parseJwt = (token: string) => {
    try {
      const base64Url = token.split('.')[1];
      const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
      const jsonPayload = decodeURIComponent(atob(base64).split('').map((c) => {
        return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
      }).join(''));
      return JSON.parse(jsonPayload);
    } catch (e) {
      return null;
    }
  };

  useEffect(() => {
    const initializeGoogleSignIn = () => {
      if ((window as any).google) {
        try {
          (window as any).google.accounts.id.initialize({
            client_id: CLIENT_ID,
            callback: (response: any) => {
              const userData = parseJwt(response.credential);
              if (userData) {
                onLogin({
                  id: userData.sub,
                  name: userData.name,
                  email: userData.email,
                  picture: userData.picture
                });
              } else {
                setError("解析 Google 回傳資料失敗。");
              }
            },
            auto_select: false,
            error_callback: (err: any) => {
              console.error("Google Auth Error:", err);
              if (err.type === "origin_mismatch") {
                setError("網域未授權 (Origin Mismatch)");
              }
            }
          });

          if (googleBtnRef.current) {
            (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
              theme: "filled_black",
              size: "large",
              width: "320",
              text: "signin_with",
              shape: "pill"
            });
          }
        } catch (err) {
          console.error("GSI Error:", err);
          setError("Google 服務初始化異常");
        }
      }
    };

    if (!(window as any).google) {
      const script = document.createElement('script');
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      script.defer = true;
      script.onload = initializeGoogleSignIn;
      document.head.appendChild(script);
    } else {
      initializeGoogleSignIn();
    }
  }, [CLIENT_ID]);

  const handleGuestLogin = () => {
    onLogin({ 
      id: 'guest_user', 
      name: '訪客主管', 
      email: 'guest@guardshift.pro', 
      picture: 'https://ui-avatars.com/api/?name=Guest&background=0D8ABC&color=fff' 
    });
  };

  return (
    <div className="min-h-screen bg-[#050a1a] flex items-center justify-center p-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
      <div className="absolute top-0 left-0 w-full h-full">
        <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[60%] bg-blue-600/30 rounded-full blur-[120px] animate-pulse"></div>
        <div className="absolute bottom-[-10%] right-[-5%] w-[40%] h-[40%] bg-indigo-600/20 rounded-full blur-[120px]"></div>
      </div>

      <div className="max-w-md w-full z-10">
        <div className="bg-[#0f172a]/80 backdrop-blur-2xl border border-white/10 p-8 sm:p-10 rounded-[2.5rem] shadow-2xl flex flex-col items-center">
          
          <div className="relative mb-8">
            <div className="absolute inset-0 bg-blue-500 blur-2xl opacity-20 animate-pulse"></div>
            <div className="relative bg-gradient-to-br from-blue-500 to-indigo-700 p-5 rounded-3xl shadow-2xl">
              <ShieldCheck className="w-14 h-14 text-white" />
            </div>
          </div>
          
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter text-center">保全排班王</h1>
          <p className="text-[#ffffff] text-lg text-center mb-8 font-medium">
            案場自動排班系統
          </p>

          <div className="space-y-5 w-full flex flex-col items-center">
             <button 
              onClick={handleGuestLogin}
              className="w-full bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white py-4 px-6 rounded-2xl font-black text-lg shadow-xl shadow-blue-500/20 flex items-center justify-center gap-2 transition-all active:scale-[0.98] group relative overflow-hidden ring-4 ring-blue-500/10"
            >
              <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-300"></div>
              <Users className="w-5 h-5 relative z-10" />
              <span className="relative z-10">不登入使用 \n(不儲存資料)</span>
              <ArrowRight className="w-5 h-5 relative z-10 group-hover:translate-x-1 transition-transform" />
            </button>

            <div className="w-full flex items-center gap-4 py-1">
              <div className="h-[1px] bg-white/5 flex-1"></div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">其他方式</span>
              <div className="h-[1px] bg-white/5 flex-1"></div>
            </div>

            <div className="w-full flex flex-col items-center gap-2 opacity-80 hover:opacity-100 transition-opacity">
                <div ref={googleBtnRef} className="w-full flex justify-center min-h-[50px]"></div>
                <p className="text-slate-500 text-[10px] text-center max-w-[280px] leading-relaxed">
                    * 若 Google 登入出現 <span className="text-red-400 font-mono">400 origin_mismatch</span> 錯誤，代表目前的預覽網址未被授權。請直接使用上方藍色按鈕即可。
                </p>
            </div>

            {error && (
              <div className="w-full p-3 bg-red-500/10 border border-red-500/20 rounded-xl flex items-start gap-3 text-red-400 animate-in shake duration-300">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold">登入受限</p>
                  <p className="opacity-80">請改用「直接開始使用」按鈕進入系統。</p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-8 flex items-center gap-4 text-slate-700">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">Secure Local Storage</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Login;
