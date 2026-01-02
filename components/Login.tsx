
import React, { useEffect, useRef } from 'react';
import { ShieldCheck, MessageCircle, ArrowRight } from 'lucide-react';
import { User } from '../types';

interface LoginProps {
  onLogin: (user: User) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const googleBtnRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // 檢查 Google SDK 是否加載
    const initGoogle = () => {
      if ((window as any).google) {
        (window as any).google.accounts.id.initialize({
          client_id: "YOUR_GOOGLE_CLIENT_ID.apps.googleusercontent.com", // 需替換為正式 ID
          callback: (response: any) => {
            console.log("Encoded JWT ID token: " + response.credential);
            // 實際環境中會驗證 JWT，這裡模擬獲取使用者資料
            handleMockSuccess();
          },
        });

        if (googleBtnRef.current) {
          (window as any).google.accounts.id.renderButton(googleBtnRef.current, {
            theme: "outline",
            size: "large",
            width: 300,
            text: "signin_with",
            shape: "pill"
          });
        }
      }
    };

    // 延遲初始化以確保 SDK 載入
    const timer = setTimeout(initGoogle, 1000);
    return () => clearTimeout(timer);
  }, []);

  const handleMockSuccess = () => {
    onLogin({
      id: 'google_user_' + Math.random().toString(36).substr(2, 9),
      name: '案場主管',
      email: 'manager@guardshift.ai',
      picture: 'https://ui-avatars.com/api/?name=Admin&background=2563eb&color=fff'
    });
  };

  return (
    <div className="min-h-screen bg-[#020617] flex items-center justify-center p-6 relative overflow-hidden">
      {/* 科技感背景 */}
      <div className="absolute top-0 left-0 w-full h-full opacity-20">
        <div className="absolute top-[-10%] left-[-10%] w-[50%] h-[50%] bg-blue-600 rounded-full blur-[120px]"></div>
        <div className="absolute bottom-[-10%] right-[-10%] w-[50%] h-[50%] bg-indigo-600 rounded-full blur-[120px]"></div>
      </div>

      <div className="max-w-md w-full z-10 animate-in fade-in zoom-in-95 duration-700">
        <div className="bg-white/10 backdrop-blur-3xl border border-white/20 p-10 rounded-[2.5rem] shadow-2xl shadow-blue-500/10 flex flex-col items-center">
          <div className="bg-blue-600 p-4 rounded-3xl shadow-xl mb-8">
            <ShieldCheck className="w-12 h-12 text-white" />
          </div>
          
          <h1 className="text-4xl font-black text-white mb-2 tracking-tighter">GuardShift <span className="text-blue-500">Pro</span></h1>
          <p className="text-slate-400 text-center mb-10 font-medium">專業案場自動排班雲端系統</p>

          <div className="space-y-4 w-full flex flex-col items-center">
            {/* Google 正式按鈕 */}
            <div ref={googleBtnRef} className="w-full flex justify-center"></div>
            
            <div className="w-full flex items-center gap-4 py-4">
              <div className="h-[1px] bg-white/10 flex-1"></div>
              <span className="text-slate-500 text-[10px] font-bold uppercase tracking-widest">或其他登入方式</span>
              <div className="h-[1px] bg-white/10 flex-1"></div>
            </div>

            <button 
              onClick={() => alert("LINE 登入建置中...")}
              className="w-full bg-[#06C755] hover:bg-[#05b34c] text-white py-4 px-6 rounded-2xl font-bold flex items-center justify-center gap-3 transition-all active:scale-[0.98] shadow-lg shadow-green-500/10"
            >
              <MessageCircle className="w-5 h-5 fill-current" />
              使用 LINE 帳號登入
            </button>

            <button 
              onClick={handleMockSuccess}
              className="mt-6 text-slate-400 hover:text-white text-sm font-medium flex items-center gap-2 transition-colors"
            >
              略過，以訪客身份進入 <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
        
        <p className="text-center mt-8 text-slate-600 text-xs font-bold uppercase tracking-[0.3em]">
          Powered by GuardShift AI
        </p>
      </div>
    </div>
  );
};

export default Login;
