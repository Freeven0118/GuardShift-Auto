
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, MessageCircle, ArrowRight, AlertCircle, Chrome, Globe, Lock, Info, Copy, ExternalLink } from 'lucide-react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const googleBtnRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [currentOrigin, setCurrentOrigin] = useState('');

  // 已填入您提供的正式 Google Client ID
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
    // 自動取得目前程式執行的真實 Origin
    setCurrentOrigin(window.location.origin);

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
            // 處理錯誤
            error_callback: (err: any) => {
              console.error("Google Auth Error:", err);
              if (err.type === "origin_mismatch") {
                setError("網域不匹配：請檢查 Google Console 設定。");
              }
            }
          });

          if (googleBtnRef.current) {
            (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
              theme: "filled_blue",
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

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    const btn = document.getElementById('copy-btn');
    if (btn) btn.innerText = "已複製！";
    setTimeout(() => { if (btn) btn.innerText = "複製網域"; }, 2000);
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
          
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter text-center">GuardShift <span className="text-blue-500">Pro</span></h1>
          <p className="text-slate-400 text-center mb-8 font-medium text-sm">
            專業保全排班系統 · 已串接正式登入
          </p>

          <div className="space-y-4 w-full flex flex-col items-center">
            
            <div ref={googleBtnRef} className="w-full flex justify-center min-h-[50px]"></div>

            {error && (
              <div className="w-full p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-start gap-3 text-red-400 mb-4 animate-in shake duration-300">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="text-xs">
                  <p className="font-bold mb-1">登入初始化失敗</p>
                  <p className="opacity-80">通常是「已授權的 JavaScript 來源」填寫錯誤。請檢查下方診斷建議。</p>
                </div>
              </div>
            )}

            {/* 配置診斷助手 */}
            <div className="w-full mt-4 animate-in fade-in slide-in-from-bottom-2">
              <div className="p-6 bg-blue-500/5 border border-white/5 rounded-3xl">
                <div className="flex items-center gap-2 text-slate-500 mb-4">
                  <Globe className="w-4 h-4" />
                  <span className="text-[10px] font-black uppercase tracking-widest">環境部署資訊</span>
                </div>
                
                <div className="space-y-4">
                  <div>
                    <p className="text-[11px] text-slate-400 mb-2">
                      如果無法看到 Google 登入按鈕，請在 Google Console 的來源網域填寫：
                    </p>
                    <div className="flex items-center gap-2 bg-black/40 p-3 rounded-xl border border-white/5 group">
                      <code className="text-[10px] text-blue-300 truncate flex-1 font-mono font-bold">{currentOrigin}</code>
                      <button 
                        id="copy-btn"
                        onClick={() => copyToClipboard(currentOrigin)}
                        className="bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-[9px] px-2 py-1 rounded-md font-bold transition-colors border border-blue-500/30"
                      >
                        複製網域
                      </button>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/5">
                    <button 
                      onClick={() => onLogin({ id: 'dev_user', name: '測試主管', email: 'demo@guardshift.pro', picture: 'https://ui-avatars.com/api/?name=Admin&background=000&color=fff' })}
                      className="w-full text-slate-500 hover:text-white py-2 rounded-xl text-[10px] font-bold transition-all flex items-center justify-center gap-2"
                    >
                      暫時使用測試模式進入 <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="w-full flex items-center gap-4 py-2">
              <div className="h-[1px] bg-white/5 flex-1"></div>
              <span className="text-slate-600 text-[10px] font-bold uppercase tracking-widest">or</span>
              <div className="h-[1px] bg-white/5 flex-1"></div>
            </div>

            <button 
              onClick={() => alert("LINE Login 正在進行商用帳號審核中...")}
              className="w-full bg-[#06C755]/10 hover:bg-[#06C755]/20 text-[#06C755] border border-[#06C755]/30 py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-[0.98]"
            >
              <MessageCircle className="w-5 h-5 fill-current" />
              使用 LINE 帳號登入
            </button>
          </div>

          <div className="mt-8 flex items-center gap-4 text-slate-700">
            <div className="flex items-center gap-1.5">
              <Lock className="w-3 h-3" />
              <span className="text-[9px] font-bold uppercase tracking-widest">TLS 1.3 Secure</span>
            </div>
          </div>
        </div>
        
        <p className="text-center mt-6 text-slate-700 text-[10px] font-black uppercase tracking-[0.4em]">
          GuardShift AI · Production Version
        </p>
      </div>
    </div>
  );
};

export default Login;
