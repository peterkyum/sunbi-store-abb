/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Search,
  Video,
  ClipboardCheck,
  FileText,
  Image as ImageIcon,
  MessageSquare,
  Leaf,
  Bell,
  Phone,
  Plus,
  Send,
  X,
  AlertCircle,
  CheckCircle2,
  Clock,
  Upload,
  Eye,
  MapPin,
  ChevronRight,
  PlayCircle,
  Edit,
  Trash2,
  Users,
  Download
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';
import { supabase } from './supabase';

// Fix leaflet default icon
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// CSV parser
import Papa from 'papaparse';

// --- Constants ---
const MENU_ITEMS = [
  { id: 'home', label: '홈', icon: Leaf },
  { id: 'consulting', label: '1:1 문의', icon: MessageSquare },
];

enum Category {
  RECIPE = 'recipe',
  VIDEO = 'video',
  CHECKLIST = 'checklist',
  DOCUMENT = 'document',
  IMAGE = 'image',
}

const CATEGORY_LABELS: Record<Category, string> = {
  [Category.RECIPE]: '레시피',
  [Category.VIDEO]: '영상 매뉴얼',
  [Category.CHECKLIST]: '체크리스트',
  [Category.DOCUMENT]: '문서/서식',
  [Category.IMAGE]: '이미지 자료',
};

// --- Interfaces ---
interface ConsultingPost {
  id: string;
  category: string;
  title: string;
  content: string;
  author: string;
  authorUid: string;
  storeName: string;
  createdAt: string;
  status: 'pending' | 'answered';
  answer?: string;
  answeredBy?: string;
  answeredAt?: string;
}

interface UserProfile {
  uid: string;
  email: string;
  name: string;
  role: 'manager' | 'owner';
  storeName: string;
  position: string;
  businessNumber?: string;
  invoiceEmail?: string;
  phone?: string;
}

interface Notice {
  id: string;
  title: string;
  content: string;
  author: string;
  createdAt: string;
  viewCount: number;
}

interface ManualItem {
  id: string;
  category: Category;
  title: string;
  content: string;
  imageUrl?: string;
  videoUrl?: string;
  fileUrl?: string;
  fileName?: string;
  author: string;
  createdAt: string;
  viewCount: number;
}

// HQ accounts (본사 계정)
const HQ_ACCOUNTS = [
  { email: 'peterkim9427@gmail.com', pw: 'sunbi1234', name: '김연겸', position: '본부장', role: 'manager', storeName: '본사' },
  { email: 'kang@sunbi.com', pw: 'sunbi1234', name: '강한빛', position: '대표', role: 'manager', storeName: '본사' },
  { email: 'byun@sunbi.com', pw: 'sunbi1234', name: '변우석', position: '이사', role: 'manager', storeName: '본사' },
  { email: 'yoon@sunbi.com', pw: 'sunbi1234', name: '윤석진', position: '팀장', role: 'manager', storeName: '본사' },
  { email: 'gil@sunbi.com', pw: 'sunbi1234', name: '길태훈', position: '팀장', role: 'manager', storeName: '본사' }
];

// Branches (39 entries)
const BRANCHES = [
  { name: '광교중앙역점', lat: 37.2854, lng: 127.0534, address: '경기도 수원시 영통구 도청로 95, 지1층 B1-202호', region: '경기', sv: '강한빛', owner: '강한빛' },
  { name: '매탄점', lat: 37.2655, lng: 127.0340, address: '경기 수원시 영통구 삼성로 210 1층', region: '경기', sv: '윤석진', owner: '윤정임' },
  { name: '광교호수공원점', lat: 37.2887, lng: 127.0466, address: '경기도 수원시 광교중앙로180', region: '경기', sv: '윤석진', owner: '박영준' },
  { name: '상현역점', lat: 37.2937, lng: 127.0696, address: '경기도 용인시 수지구 광교중앙로 296번길 14 2층 201호', region: '경기', sv: '윤석진', owner: '유영희' },
  { name: '사당점', lat: 37.4836, lng: 126.9816, address: '서울 서초구 방배천로2길 37 2층', region: '서울', sv: '윤석진', owner: '최규영' },
  { name: '성남고등점', lat: 37.4330, lng: 127.0490, address: '경기 성남시 수정구 청계산로 686 1층 144호, 145호', region: '경기', sv: '윤석진', owner: '이주현' },
  { name: '월드컵점', lat: 37.2845, lng: 127.0160, address: '경기 수원시 팔달구 창룡대로210번길 41 1층', region: '경기', sv: '윤석진', owner: '권지훈' },
  { name: '고색점', lat: 37.2570, lng: 126.9730, address: '경기 수원시 권선구 산업로 180 DH테크타워 123.124호', region: '경기', sv: '길태훈', owner: '채선미' },
  { name: '울진점', lat: 36.9930, lng: 129.4002, address: '경북 울진군 울진읍 읍내8길 42-10 1층', region: '경북', sv: '길태훈', owner: '은종민' },
  { name: '한림대학교동탄성심병원점', lat: 37.2270, lng: 127.0570, address: '경기 화성시 삼성1로 150 1층 107호', region: '경기', sv: '길태훈', owner: '채상호' },
  { name: '수정구청점', lat: 37.4500, lng: 127.1380, address: '경기 성남시 수정구 수정로 249 1층', region: '경기', sv: '길태훈', owner: '이은경' },
  { name: '김천대신점', lat: 36.1198, lng: 128.1135, address: '경북 김천시 부거리길 20 다동 2호', region: '경북', sv: '길태훈', owner: '김수기' },
  { name: '안동점', lat: 36.5684, lng: 128.7294, address: '경북 안동시 하이마로 136 2층', region: '경북', sv: '길태훈', owner: '박은미' },
  { name: '동탄영천점', lat: 37.2060, lng: 127.0710, address: '경기 화성시 동탄대로 637 1층 110, 111호', region: '경기', sv: '윤석진', owner: '변우석' },
  { name: '동탄방교점', lat: 37.2170, lng: 127.0560, address: '경기 화성시 동탄기흥로 147-11 1층 105호106호', region: '경기', sv: '윤석진', owner: '이상민' },
  { name: '춘천엔터점', lat: 37.8680, lng: 127.7280, address: '강원도 춘천시 후석로 120 2층 211-2호', region: '강원', sv: '길태훈', owner: '김성태' },
  { name: '충주호암점', lat: 36.9600, lng: 127.9280, address: '충북 충주시 호암중앙1로51', region: '충북', sv: '길태훈', owner: '김민호' },
  { name: '흥덕점', lat: 37.2790, lng: 127.0730, address: '경기도 용인시 기흥구 영덕동1005 흥덕IT벨리 1층 118-a호', region: '경기', sv: '윤석진', owner: '박미정' },
  { name: '용인백암점', lat: 37.1560, lng: 127.3220, address: '경기도 용인시 처인구 백암면 백암로 161', region: '경기', sv: '길태훈', owner: '정혜민' },
  { name: '신림대학동점', lat: 37.4739, lng: 126.9308, address: '서울 관악구 신림로 113', region: '서울', sv: '길태훈', owner: '오정숙' },
  { name: '대구침산점', lat: 35.8900, lng: 128.5810, address: '대구광역시 북구 옥산로 17길 14 1층 113호', region: '경북', sv: '길태훈', owner: '정현욱' },
  { name: '안산신길점', lat: 37.3380, lng: 126.7810, address: '경기도 안산시 단원구 신길로 10-5', region: '경기', sv: '길태훈', owner: '최명애' },
  { name: '안산반월공단점', lat: 37.3370, lng: 126.7520, address: '경기도 안산시 단원구 만해로 205 A127호', region: '경기', sv: '길태훈', owner: '서유림' },
  { name: '송파문정역점', lat: 37.4860, lng: 127.1230, address: '송파구 문정동 642 송파테라타워2 1층 비-106호', region: '서울', sv: '윤석진', owner: '허영란' },
  { name: '송파방이점', lat: 37.5110, lng: 127.1150, address: '송파구 방이동 39 잠실제니알 1층 101호', region: '서울', sv: '윤석진', owner: '이영예' },
  { name: '선릉역점', lat: 37.5045, lng: 127.0490, address: '서울 강남구 역삼동 705 지하 1층', region: '서울', sv: '윤석진', owner: '김준' },
  { name: '산본롯데점', lat: 37.3630, lng: 126.9320, address: '경기 군포시 산본동 1145-6 7층', region: '경기', sv: '윤석진', owner: '강유림' },
  { name: '수원일월점', lat: 37.2570, lng: 126.9920, address: '경기 수원시 권선구 일월천로4번길 49-6 1층', region: '경기', sv: '길태훈', owner: '박성림' },
  { name: '안산중앙역점', lat: 37.3290, lng: 126.8280, address: '경기 안산시 단원구 당곡로 27 1층 111호', region: '경기', sv: '길태훈', owner: '오민재' },
  { name: '케이티위즈파크점', lat: 37.2990, lng: 127.0090, address: '경기 수원시 장안구 송원로 82 1, 2층', region: '경기', sv: '길태훈', owner: '곽행화' },
  { name: '포천송우리점', lat: 37.7710, lng: 127.1430, address: '경기 포천시 소흘읍 호국로 297', region: '경기', sv: '길태훈', owner: '신윤서' },
  { name: '삼성대치점', lat: 37.5070, lng: 127.0590, address: '서울 강남구 영동대로 86길 27', region: '서울', sv: '윤석진', owner: '이미영' },
  { name: '분당정자역점', lat: 37.3683, lng: 127.1108, address: '경기 성남시 분당구 정자동 170-1', region: '경기', sv: '김연겸', owner: '김현경' },
  { name: '의정부민락점', lat: 37.7560, lng: 127.0830, address: '경기도 의정부시 오목로 205번길 30', region: '경기', sv: '길태훈', owner: '이미경' },
  { name: '일산탄현역점', lat: 37.6880, lng: 126.7560, address: '경기도 고양시 일산서구 덕이동 388', region: '경기', sv: '길태훈', owner: '공미영' },
  { name: '남양주다산한강갤러리점', lat: 37.6110, lng: 127.1530, address: '경기도 남양주 다산지금로163번길 6 한강프리미어갤러리 1층 R124호', region: '경기', sv: '길태훈', owner: '임주은' },
  { name: '남양주2청사점', lat: 37.6120, lng: 127.1480, address: '경기도 남양주시 다산지금로 16번길 43 109,110호', region: '경기', sv: '길태훈', owner: '김혜란' },
  { name: '역삼점', lat: 37.5012, lng: 127.0396, address: '서울특별시 강남구 역삼동 642-21 성지하이츠 지하1층', region: '서울', sv: '윤석진', owner: '전형일' },
  { name: '인천구월동점', lat: 37.4490, lng: 126.7040, address: '인천광역시 남동구 미래로 30 106호, 107호', region: '인천', sv: '길태훈', owner: '김애란' },
  { name: '군포첨단산업단지점', lat: 37.3440, lng: 126.9380, address: '경기 군포시 번영로 40 1층 102호', region: '경기', sv: '길태훈', owner: '박상권' },
];

export default function App() {
  // --- Auth State ---
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [loginForm, setLoginForm] = useState({ email: '', password: '' });
  const [signUpForm, setSignUpForm] = useState({ email: '', password: '', name: '', storeName: '' });
  const [authError, setAuthError] = useState('');
  const [isSignUp, setIsSignUp] = useState(false);
  const [authLoading, setAuthLoading] = useState(false);

  // --- App State ---
  const [activeTab, setActiveTab] = useState('home');
  const [searchQuery, setSearchQuery] = useState('');

  // --- Consulting State ---
  const [consultingPosts, setConsultingPosts] = useState<ConsultingPost[]>([]);
  const [selectedPost, setSelectedPost] = useState<ConsultingPost | null>(null);
  const [showCreatePost, setShowCreatePost] = useState(false);
  const [newPost, setNewPost] = useState({ category: '운영', title: '', content: '' });
  const [answerText, setAnswerText] = useState('');
  const [consultingFilter, setConsultingFilter] = useState('all');

  // --- SOS State ---
  const [showSosModal, setShowSosModal] = useState(false);
  const [sosForm, setSosForm] = useState({ title: '', message: '' });
  const [sosLoading, setSosLoading] = useState(false);
  const [sosSuccess, setSosSuccess] = useState(false);

  // --- Notice State ---
  const [notices, setNotices] = useState<Notice[]>([]);
  const [showNoticeModal, setShowNoticeModal] = useState(false);
  const [selectedNotice, setSelectedNotice] = useState<Notice | null>(null);
  const [showCreateNotice, setShowCreateNotice] = useState(false);
  const [newNotice, setNewNotice] = useState({ title: '', content: '' });
  const [showEditNotice, setShowEditNotice] = useState(false);
  const [editNotice, setEditNotice] = useState({ id: '', title: '', content: '' });
  const [showDeleteNoticeConfirm, setShowDeleteNoticeConfirm] = useState(false);
  const [deleteNoticeId, setDeleteNoticeId] = useState('');

  // --- Manual State ---
  const [manualItems, setManualItems] = useState<ManualItem[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
  const [selectedManual, setSelectedManual] = useState<ManualItem | null>(null);
  const [showCreateManual, setShowCreateManual] = useState(false);
  const [newManual, setNewManual] = useState({ category: Category.RECIPE, title: '', content: '', imageUrl: '', videoUrl: '' });
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isUploading, setIsUploading] = useState(false);
  const [showEditManual, setShowEditManual] = useState(false);
  const [editManual, setEditManual] = useState<{ id: string; category: Category; title: string; content: string; imageUrl: string; videoUrl: string }>({ id: '', category: Category.RECIPE, title: '', content: '', imageUrl: '', videoUrl: '' });
  const [showDeleteManualConfirm, setShowDeleteManualConfirm] = useState(false);
  const [deleteManualId, setDeleteManualId] = useState('');

  // --- Q&A Chat State ---
  const [showQaChat, setShowQaChat] = useState(false);
  const [qaMessages, setQaMessages] = useState<{ role: 'user' | 'assistant'; content: string }[]>([]);
  const [qaInput, setQaInput] = useState('');
  const [qaLoading, setQaLoading] = useState(false);

  // --- Map State ---
  const [showMap, setShowMap] = useState(false);

  // --- A/S State ---
  const [showAsContacts, setShowAsContacts] = useState(false);

  // --- Business Registration State ---
  const [showBusinessReg, setShowBusinessReg] = useState(false);
  const [businessRegForm, setBusinessRegForm] = useState({ businessName: '', ownerName: '', businessNumber: '', address: '', phone: '' });

  // --- User Management State ---
  const [showUserManagement, setShowUserManagement] = useState(false);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [createUserForm, setCreateUserForm] = useState({ email: '', password: '', name: '', role: 'owner' as 'manager' | 'owner', storeName: '', position: '', businessNumber: '', invoiceEmail: '', phone: '' });
  const [createUserLoading, setCreateUserLoading] = useState(false);
  const [createUserError, setCreateUserError] = useState('');

  // --- KB Management State ---
  const [showKbManagement, setShowKbManagement] = useState(false);
  const [kbCsvFile, setKbCsvFile] = useState<File | null>(null);
  const [kbUploadLoading, setKbUploadLoading] = useState(false);
  const [kbUploadResult, setKbUploadResult] = useState('');
  const [kbNewEntry, setKbNewEntry] = useState({ question: '', answer: '', category: '' });

  // --- Auth Effects ---
  const loadUserProfile = async (uid: string, email?: string) => {
    // Try by uid first, then by email as fallback
    let { data } = await supabase.from('users').select('*').eq('uid', uid).maybeSingle();
    if (!data && email) {
      const result = await supabase.from('users').select('*').eq('email', email).maybeSingle();
      data = result.data;
      // Update uid if found by email
      if (data) {
        await supabase.from('users').update({ uid }).eq('email', email);
      }
    }

    if (data) {
      setUserProfile({
        uid: data.uid || uid,
        email: data.email,
        name: data.name,
        role: data.role,
        storeName: data.store_name,
        position: data.position,
      });
    } else {
      // Check if this is a HQ account
      const hqAccount = HQ_ACCOUNTS.find(a => a.email === email);
      if (hqAccount) {
        const profile: UserProfile = {
          uid,
          email: hqAccount.email,
          name: hqAccount.name,
          role: hqAccount.role as 'manager' | 'owner',
          storeName: hqAccount.storeName,
          position: hqAccount.position,
        };
        await supabase.from('users').upsert({
          uid,
          email: hqAccount.email,
          name: hqAccount.name,
          role: hqAccount.role,
          store_name: hqAccount.storeName,
          position: hqAccount.position,
        });
        setUserProfile(profile);
      }
    }
  };

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id, session.user.email);
      }
      setIsAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadUserProfile(session.user.id, session.user.email);
      } else {
        setUserProfile(null);
      }
    });
    return () => subscription.unsubscribe();
  }, []);

  // --- Load Data ---
  useEffect(() => {
    if (user) {
      loadConsultingPosts();
      loadNotices();
      loadManualItems();
    }
  }, [user]);

  // --- Data Loading Functions ---
  const loadConsultingPosts = async () => {
    try {
      const { data, error } = await supabase
        .from('consulting_posts')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const posts: ConsultingPost[] = (data ?? []).map((row: any) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        content: row.content,
        author: row.author,
        authorUid: row.author_uid,
        storeName: row.store_name,
        createdAt: row.created_at,
        status: row.status,
        answer: row.answer,
        answeredBy: row.answered_by,
        answeredAt: row.answered_at,
      }));
      setConsultingPosts(posts);
    } catch (error) {
      console.error('Error loading consulting posts:', error);
    }
  };

  const loadNotices = async () => {
    try {
      const { data, error } = await supabase
        .from('notices')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const items: Notice[] = (data ?? []).map((row: any) => ({
        id: row.id,
        title: row.title,
        content: row.content,
        author: row.author,
        createdAt: row.created_at,
        viewCount: row.view_count ?? 0,
      }));
      setNotices(items);
    } catch (error) {
      console.error('Error loading notices:', error);
    }
  };

  const loadManualItems = async () => {
    try {
      const { data, error } = await supabase
        .from('manuals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      const items: ManualItem[] = (data ?? []).map((row: any) => ({
        id: row.id,
        category: row.category,
        title: row.title,
        content: row.content,
        imageUrl: row.image_url,
        videoUrl: row.video_url,
        fileUrl: row.file_url,
        fileName: row.file_name,
        author: row.author,
        createdAt: row.created_at,
        viewCount: row.view_count ?? 0,
      }));
      setManualItems(items);
    } catch (error) {
      console.error('Error loading manual items:', error);
    }
  };

  const loadAllUsers = async () => {
    try {
      const { data, error } = await supabase.from('users').select('*');
      if (error) throw error;
      const users: UserProfile[] = (data ?? []).map((row: any) => ({
        uid: row.uid,
        email: row.email,
        name: row.name,
        role: row.role,
        storeName: row.store_name,
        position: row.position,
        businessNumber: row.business_number,
        invoiceEmail: row.invoice_email,
        phone: row.phone,
      }));
      setAllUsers(users);
    } catch (error) {
      console.error('Error loading users:', error);
    }
  };

  // --- Auth Handlers ---
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: loginForm.email,
        password: loginForm.password,
      });
      if (error) throw error;
    } catch (error: any) {
      setAuthError(`로그인 실패: ${error?.message || '이메일과 비밀번호를 확인해 주세요.'}`);
    }
    setAuthLoading(false);
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError('');
    try {
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: signUpForm.email,
        password: signUpForm.password,
      });
      if (authError) throw authError;

      // Create user profile in users table
      if (authData.user) {
        const profile: UserProfile = {
          uid: authData.user.id,
          email: signUpForm.email,
          name: signUpForm.name,
          role: 'owner',
          storeName: signUpForm.storeName,
          position: '점주',
        };
        await supabase.from('users').insert({
          uid: authData.user.id,
          email: signUpForm.email,
          name: signUpForm.name,
          role: 'owner',
          store_name: signUpForm.storeName,
          position: '점주',
        });
        setUserProfile(profile);
      }
    } catch (error: any) {
      setAuthError(error.message || '회원가입에 실패했습니다.');
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUserProfile(null);
    setActiveTab('home');
  };

  // --- Consulting Handlers ---
  const handleCreatePost = async () => {
    if (!user || !userProfile || !newPost.title || !newPost.content) return;
    try {
      await supabase.from('consulting_posts').insert({
        category: newPost.category,
        title: newPost.title,
        content: newPost.content,
        author: userProfile.name,
        author_uid: user.id,
        store_name: userProfile.storeName,
        created_at: new Date().toISOString(),
        status: 'pending',
      });

      // Notify via server (Slack + Notion)
      try {
        await fetch('/api/notion/consulting', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeName: userProfile.storeName,
            category: newPost.category,
            title: newPost.title,
            content: newPost.content,
          }),
        });
      } catch (notifyError) {
        console.error('Notification error:', notifyError);
      }

      setNewPost({ category: '운영', title: '', content: '' });
      setShowCreatePost(false);
      loadConsultingPosts();
    } catch (error) {
      console.error('Error creating post:', error);
    }
  };

  const handleAnswerPost = async (postId: string) => {
    if (!answerText || !userProfile) return;
    try {
      await supabase.from('consulting_posts').update({
        status: 'answered',
        answer: answerText,
        answered_by: userProfile.name,
        answered_at: new Date().toISOString(),
      }).eq('id', postId);
      setAnswerText('');
      setSelectedPost(null);
      loadConsultingPosts();
    } catch (error) {
      console.error('Error answering post:', error);
    }
  };

  const handleDeletePost = async (postId: string) => {
    try {
      await supabase.from('consulting_posts').delete().eq('id', postId);
      setSelectedPost(null);
      loadConsultingPosts();
    } catch (error) {
      console.error('Error deleting post:', error);
    }
  };

  // --- SOS Handler ---
  const handleSosSubmit = async () => {
    if (!sosForm.title || !sosForm.message || !userProfile) return;
    setSosLoading(true);
    try {
      // Save to Supabase
      await supabase.from('sos_inquiries').insert({
        title: sosForm.title,
        message: sosForm.message,
        author: userProfile.name,
        author_uid: user?.id,
        store_name: userProfile.storeName,
        created_at: new Date().toISOString(),
        status: 'pending',
      });

      // Notify via server
      try {
        await fetch('/api/notion/sos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            storeName: userProfile.storeName,
            title: sosForm.title,
            message: sosForm.message,
          }),
        });
      } catch (notifyError) {
        console.error('SOS notification error:', notifyError);
      }

      setSosSuccess(true);
      setSosForm({ title: '', message: '' });
      setTimeout(() => {
        setSosSuccess(false);
        setShowSosModal(false);
      }, 2000);
    } catch (error) {
      console.error('Error submitting SOS:', error);
    }
    setSosLoading(false);
  };

  // --- Notice Handlers ---
  const handleCreateNotice = async () => {
    if (!newNotice.title || !newNotice.content || !userProfile) return;
    try {
      await supabase.from('notices').insert({
        title: newNotice.title,
        content: newNotice.content,
        author: userProfile.name,
        created_at: new Date().toISOString(),
        view_count: 0,
      });
      setNewNotice({ title: '', content: '' });
      setShowCreateNotice(false);
      loadNotices();
    } catch (error) {
      console.error('Error creating notice:', error);
    }
  };

  const handleViewNotice = async (notice: Notice) => {
    setSelectedNotice(notice);
    setShowNoticeModal(true);
    // Increment view count
    try {
      const { data: currentNotice } = await supabase.from('notices').select('view_count').eq('id', notice.id).single();
      await supabase.from('notices').update({
        view_count: (currentNotice?.view_count ?? 0) + 1,
      }).eq('id', notice.id);
    } catch (error) {
      console.error('Error updating view count:', error);
    }
  };

  const handleEditNotice = async () => {
    if (!editNotice.title || !editNotice.content) return;
    try {
      await supabase.from('notices').update({
        title: editNotice.title,
        content: editNotice.content,
      }).eq('id', editNotice.id);
      setShowEditNotice(false);
      setShowNoticeModal(false);
      setSelectedNotice(null);
      loadNotices();
    } catch (error) {
      console.error('Error editing notice:', error);
    }
  };

  const handleDeleteNotice = async () => {
    if (!deleteNoticeId) return;
    try {
      await supabase.from('notices').delete().eq('id', deleteNoticeId);
      setShowDeleteNoticeConfirm(false);
      setDeleteNoticeId('');
      setShowNoticeModal(false);
      setSelectedNotice(null);
      loadNotices();
    } catch (error) {
      console.error('Error deleting notice:', error);
    }
  };

  // --- Manual Handlers ---
  const handleCreateManual = async () => {
    if (!newManual.title || !newManual.content || !userProfile) return;
    setIsUploading(true);

    try {
      let fileUrl = '';
      let fileName = '';

      if (manualFile) {
        const filePath = `manuals/${Date.now()}_${manualFile.name}`;
        const { data: uploadData, error: uploadError } = await supabase.storage
          .from('uploads')
          .upload(filePath, manualFile);
        if (uploadError) throw uploadError;
        if (uploadData) {
          const { data: urlData } = supabase.storage.from('uploads').getPublicUrl(filePath);
          fileUrl = urlData.publicUrl;
          fileName = manualFile.name;
        }
        setUploadProgress(100);
      }

      await supabase.from('manuals').insert({
        category: newManual.category,
        title: newManual.title,
        content: newManual.content,
        image_url: newManual.imageUrl || '',
        video_url: newManual.videoUrl || '',
        file_url: fileUrl,
        file_name: fileName,
        author: userProfile.name,
        created_at: new Date().toISOString(),
        view_count: 0,
      });

      setNewManual({ category: Category.RECIPE, title: '', content: '', imageUrl: '', videoUrl: '' });
      setManualFile(null);
      setUploadProgress(0);
      setShowCreateManual(false);
      loadManualItems();
    } catch (error) {
      console.error('Error creating manual:', error);
    }
    setIsUploading(false);
  };

  const handleViewManual = async (item: ManualItem) => {
    setSelectedManual(item);
    try {
      const { data: currentManual } = await supabase.from('manuals').select('view_count').eq('id', item.id).single();
      await supabase.from('manuals').update({
        view_count: (currentManual?.view_count ?? 0) + 1,
      }).eq('id', item.id);
    } catch (error) {
      console.error('Error updating view count:', error);
    }
  };

  const handleEditManual = async () => {
    if (!editManual.title || !editManual.content) return;
    try {
      await supabase.from('manuals').update({
        title: editManual.title,
        content: editManual.content,
        category: editManual.category,
        image_url: editManual.imageUrl || '',
        video_url: editManual.videoUrl || '',
      }).eq('id', editManual.id);
      setShowEditManual(false);
      setSelectedManual(null);
      loadManualItems();
    } catch (error) {
      console.error('Error editing manual:', error);
    }
  };

  const handleDeleteManual = async () => {
    if (!deleteManualId) return;
    try {
      await supabase.from('manuals').delete().eq('id', deleteManualId);
      setShowDeleteManualConfirm(false);
      setDeleteManualId('');
      setSelectedManual(null);
      loadManualItems();
    } catch (error) {
      console.error('Error deleting manual:', error);
    }
  };

  // --- Q&A Chat Handler ---
  const handleQaSubmit = async () => {
    if (!qaInput.trim()) return;
    const userMessage = qaInput.trim();
    setQaMessages(prev => [...prev, { role: 'user', content: userMessage }]);
    setQaInput('');
    setQaLoading(true);

    try {
      let apiKey = (typeof process !== 'undefined' && process.env?.GEMINI_API_KEY) || '';
      if (!apiKey) {
        try {
          const configRes = await fetch('/api/config');
          const configData = await configRes.json();
          apiKey = configData.geminiApiKey || '';
        } catch {
          // ignore
        }
      }

      if (!apiKey) {
        setQaMessages(prev => [...prev, { role: 'assistant', content: 'API 키가 설정되지 않았습니다. 관리자에게 문의해 주세요.' }]);
        setQaLoading(false);
        return;
      }

      // Load knowledge base for context
      let kbContext = '';
      try {
        const { data: kbItems } = await supabase.from('knowledge_base').select('*');
        const kbItemsMapped = kbItems ?? [];
        if (kbItemsMapped.length > 0) {
          kbContext = '\n\n[참고 지식베이스]\n' + kbItemsMapped.map((item: any) => `Q: ${item.question}\nA: ${item.answer}`).join('\n\n');
        }
      } catch {
        // ignore KB load error
      }

      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `당신은 '선비칼국수'의 본사 자동 응답기입니다. 점주님들의 질문에 친절하고 전문적으로 답변해 주세요.

주요 안내사항:
- 선비칼국수는 한국의 칼국수 전문 프랜차이즈입니다.
- 본사 운영시간: 평일 09:00~18:00
- 긴급 문의는 SOS 버튼을 이용해 주세요.
- A/S 관련 문의는 A/S 연락처를 확인해 주세요.

답변 규칙:
1. 정확하지 않은 정보는 "본사에 확인이 필요합니다"라고 안내하세요.
2. 긴급하거나 복잡한 문의는 답변 마지막에 [ESCALATE]를 붙여주세요.
3. 항상 존댓말을 사용하세요.
4. 간결하고 명확하게 답변하세요.${kbContext}`;

      const chatHistory = qaMessages.map(m => ({
        role: m.role === 'user' ? 'user' as const : 'model' as const,
        parts: [{ text: m.content }],
      }));

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [
          ...chatHistory,
          { role: 'user', parts: [{ text: userMessage }] }
        ],
        config: {
          systemInstruction,
        },
      });

      const assistantMessage = response.text || '죄송합니다. 응답을 생성하지 못했습니다.';
      setQaMessages(prev => [...prev, { role: 'assistant', content: assistantMessage }]);
    } catch (error) {
      console.error('Q&A Error:', error);
      setQaMessages(prev => [...prev, { role: 'assistant', content: '오류가 발생했습니다. 잠시 후 다시 시도해 주세요.' }]);
    }
    setQaLoading(false);
  };

  // --- User Management Handler ---
  const handleCreateUser = async () => {
    if (!createUserForm.storeName || !createUserForm.name || !createUserForm.email) return;
    setCreateUserLoading(true);
    setCreateUserError('');
    try {
      // Create auth account in Supabase
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: createUserForm.email,
        password: createUserForm.password || 'sunbi1234',
      });
      if (authError) throw authError;

      // Insert user profile into users table
      const uid = authData.user?.id || '';
      await supabase.from('users').insert({
        uid,
        email: createUserForm.email,
        name: createUserForm.name,
        role: createUserForm.role,
        store_name: createUserForm.storeName,
        position: createUserForm.position || (createUserForm.role === 'owner' ? '점주' : '직원'),
        business_number: createUserForm.businessNumber,
        invoice_email: createUserForm.invoiceEmail,
        phone: createUserForm.phone,
      });

      setCreateUserForm({ email: '', password: '', name: '', role: 'owner', storeName: '', position: '', businessNumber: '', invoiceEmail: '', phone: '' });
      loadAllUsers();
    } catch (error: any) {
      setCreateUserError(error.message || '계정 생성 중 오류가 발생했습니다.');
    }
    setCreateUserLoading(false);
  };

  // --- KB Management Handlers ---
  const handleKbAddEntry = async () => {
    if (!kbNewEntry.question || !kbNewEntry.answer) return;
    try {
      await supabase.from('knowledge_base').insert({
        question: kbNewEntry.question,
        answer: kbNewEntry.answer,
        category: kbNewEntry.category || '일반',
        created_at: new Date().toISOString(),
      });
      setKbNewEntry({ question: '', answer: '', category: '' });
      setKbUploadResult('지식베이스에 항목이 추가되었습니다.');
    } catch (error) {
      console.error('Error adding KB entry:', error);
    }
  };

  const handleKbCsvUpload = async () => {
    if (!kbCsvFile) return;
    setKbUploadLoading(true);
    setKbUploadResult('');

    try {
      const text = await kbCsvFile.text();
      Papa.parse(text, {
        header: true,
        skipEmptyLines: true,
        complete: async (results) => {
          let count = 0;
          for (const row of results.data as any[]) {
            if (row.question && row.answer) {
              await supabase.from('knowledge_base').insert({
                question: row.question,
                answer: row.answer,
                category: row.category || '일반',
                created_at: new Date().toISOString(),
              });
              count++;
            }
          }
          setKbUploadResult(`${count}개의 항목이 업로드되었습니다.`);
          setKbCsvFile(null);
          setKbUploadLoading(false);
        },
        error: (error: any) => {
          setKbUploadResult('CSV 파일 파싱에 실패했습니다.');
          setKbUploadLoading(false);
        }
      });
    } catch (error) {
      setKbUploadResult('파일 읽기에 실패했습니다.');
      setKbUploadLoading(false);
    }
  };

  // --- Helper ---
  const formatDate = (timestamp: string) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    return `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const isManager = userProfile?.role === 'manager';

  const getCategoryIcon = (category: Category) => {
    switch (category) {
      case Category.RECIPE: return <Leaf className="w-5 h-5" />;
      case Category.VIDEO: return <Video className="w-5 h-5" />;
      case Category.CHECKLIST: return <ClipboardCheck className="w-5 h-5" />;
      case Category.DOCUMENT: return <FileText className="w-5 h-5" />;
      case Category.IMAGE: return <ImageIcon className="w-5 h-5" />;
    }
  };

  const filteredManuals = manualItems.filter(item => {
    const matchesCategory = !selectedCategory || item.category === selectedCategory;
    const matchesSearch = !searchQuery ||
      item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.content.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const filteredPosts = consultingPosts.filter(post => {
    if (consultingFilter === 'all') return true;
    if (consultingFilter === 'pending') return post.status === 'pending';
    if (consultingFilter === 'answered') return post.status === 'answered';
    if (consultingFilter === 'mine') return post.authorUid === user?.id;
    return post.category === consultingFilter;
  });

  // --- Loading Screen ---
  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-amber-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-primary font-bold">로딩 중...</p>
        </div>
      </div>
    );
  }

  // --- Login / Sign Up Page ---
  if (!user) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-md"
        >
          <div className="text-center mb-10">
            <h1 className="text-4xl font-bold text-white mb-6 tracking-widest flex items-center justify-center gap-2">
              선비칼국수
              <div className="inline-flex items-center justify-center w-14 h-14 border-2 border-white rounded-full">
                <Leaf className="w-8 h-8 text-white" />
              </div>
            </h1>
            <h2 className="text-2xl font-bold text-white mb-2 tracking-tight">점주 파트너 센터</h2>
            <p className="text-accent font-bold text-sm tracking-widest">SUNBI KALGUKSU PARTNER</p>
          </div>

          <div className="w-full">
            {!isSignUp ? (
              <form onSubmit={handleLogin} className="space-y-6">
                {authError && (
                  <div className="bg-red-500/20 text-red-100 border border-red-500/50 p-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {authError}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/80 mb-1.5 ml-1">이메일 주소</label>
                    <input
                      type="email"
                      value={loginForm.email}
                      onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium"
                      placeholder="이메일을 입력하세요"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/80 mb-1.5 ml-1">비밀번호</label>
                    <input
                      type="password"
                      value={loginForm.password}
                      onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium"
                      placeholder="비밀번호를 입력하세요"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-accent text-primary py-4 rounded-xl font-bold text-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 mt-2 shadow-lg"
                >
                  {authLoading ? '로그인 중...' : '로그인하기'}
                </button>
                
                <div className="flex items-center justify-center gap-4 text-xs font-bold text-white/70 mt-8 tracking-wide">
                  <button type="button" className="hover:text-white transition-colors">아이디 찾기</button>
                  <span className="text-white/30">|</span>
                  <button type="button" className="hover:text-white transition-colors">비밀번호 재설정</button>
                  <span className="text-white/30">|</span>
                  <button type="button" onClick={() => { setIsSignUp(true); setAuthError(''); }} className="text-accent hover:text-yellow-300 transition-colors">회원가입</button>
                </div>
              </form>
            ) : (
              <form onSubmit={handleSignUp} className="space-y-6">
                <h2 className="text-xl font-bold text-white mb-2 text-center">점주 파트너 가입</h2>
                {authError && (
                  <div className="bg-red-500/20 text-red-100 border border-red-500/50 p-3 rounded-lg text-sm flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    {authError}
                  </div>
                )}
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-white/80 mb-1.5 ml-1">이메일 주소</label>
                    <input
                      type="email"
                      value={signUpForm.email}
                      onChange={(e) => setSignUpForm({ ...signUpForm, email: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium"
                      placeholder="이메일을 입력하세요"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/80 mb-1.5 ml-1">비밀번호</label>
                    <input
                      type="password"
                      value={signUpForm.password}
                      onChange={(e) => setSignUpForm({ ...signUpForm, password: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium"
                      placeholder="6자 이상"
                      required
                      minLength={6}
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/80 mb-1.5 ml-1">이름</label>
                    <input
                      type="text"
                      value={signUpForm.name}
                      onChange={(e) => setSignUpForm({ ...signUpForm, name: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium"
                      placeholder="이름을 입력하세요"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-white/80 mb-1.5 ml-1">가맹점명</label>
                    <input
                      type="text"
                      value={signUpForm.storeName}
                      onChange={(e) => setSignUpForm({ ...signUpForm, storeName: e.target.value })}
                      className="w-full px-4 py-3.5 rounded-xl bg-white/10 border border-white/20 text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-accent/50 transition-all font-medium"
                      placeholder="가맹점명을 입력하세요"
                      required
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={authLoading}
                  className="w-full bg-accent text-primary py-4 rounded-xl font-bold text-lg hover:bg-yellow-300 transition-colors disabled:opacity-50 mt-2 shadow-lg"
                >
                  {authLoading ? '가입 중...' : '회원가입하기'}
                </button>
                <div className="text-center mt-6">
                  <button type="button" onClick={() => { setIsSignUp(false); setAuthError(''); }} className="text-sm font-bold text-white/60 hover:text-white transition-colors">
                    뒤로 로그인으로
                  </button>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    );
  }

  // --- Main App ---
  return (
    <div className="min-h-screen bg-primary">
      {/* Header */}
      <header className="bg-primary/95 backdrop-blur-sm sticky top-0 z-40 border-b-4 border-brand-green">
        <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center justify-center w-8 h-8 rounded-full border border-white">
              <Leaf className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-lg font-bold text-white tracking-widest hidden sm:block">선비칼국수</h1>
            <span className="text-white/60 text-xs ml-2 hidden sm:block">|</span>
            <span className="text-white text-xs font-bold ml-1 sm:ml-0">{userProfile?.storeName} {userProfile?.name} {userProfile?.position}</span>
          </div>
          <div className="flex items-center gap-3">
             <button onClick={handleLogout} className="text-xs text-primary font-bold bg-accent hover:bg-yellow-400 px-4 py-1.5 rounded-full transition-colors shadow-sm">
              로그아웃
             </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        <AnimatePresence mode="wait">
          {/* ===== HOME TAB ===== */}
          {activeTab === 'home' && (
            <motion.div
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              {/* Welcome Banner */}
              <div className="bg-gradient-to-br from-[#FDFBEA] to-[#F2F7E1] rounded-2xl p-6 shadow-sm">
                <p className="text-brand-green font-bold text-xs mb-1">본사 파트너 센터</p>
                <h2 className="text-2xl font-bold text-[#5c4a40] mb-2 leading-tight">
                  <span className="text-brand-green">{userProfile?.name} {userProfile?.position}님</span><br/>
                  반갑습니다.
                </h2>
                <p className="text-[#5c4a40]/70 text-sm">
                  본사 임직원 전용 관리 모드입니다. 매장 지원 및 관리에 만전을 기해 주시기 바랍니다.
                </p>
              </div>

              {/* Quick Actions (Two big yellow buttons) */}
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setActiveTab('consulting')}
                  className="bg-accent text-primary p-5 rounded-2xl text-center hover:bg-yellow-400 transition-colors shadow-sm flex flex-col items-center justify-center gap-2"
                >
                  <MessageSquare className="w-6 h-6 text-primary/70" />
                  <div>
                    <p className="font-bold text-sm">SV 1:1 문의</p>
                    <p className="text-[10px] text-primary/60">(담당자 연결)</p>
                  </div>
                </button>
                <button
                  onClick={() => setShowAsContacts(true)}
                  className="bg-accent text-primary p-5 rounded-2xl text-center hover:bg-yellow-400 transition-colors shadow-sm flex flex-col items-center justify-center gap-2"
                >
                  <Phone className="w-6 h-6 text-primary/70" />
                  <div>
                    <p className="font-bold text-sm">A/S 문의</p>
                    <p className="text-[10px] text-primary/60">(비상연락망)</p>
                  </div>
                </button>
              </div>

              {/* Notices Section */}
              <div className="bg-white rounded-2xl p-5 shadow-sm">
                <div className="flex items-center gap-2 mb-4 flex-wrap">
                  <h3 className="text-lg font-bold text-primary flex items-center gap-2 mr-2">
                    <Bell className="w-5 h-5 text-gray-400" />
                    본사 공지사항
                  </h3>
                  {isManager && (
                    <div className="flex gap-2 flex-wrap">
                      <button onClick={() => setShowBusinessReg(true)} className="bg-accent px-3 py-1 text-xs font-bold rounded-full text-primary hover:bg-yellow-400 transition">사업자 등록</button>
                      <button onClick={() => setShowCreateNotice(true)} className="bg-accent px-3 py-1 text-xs font-bold rounded-full text-primary hover:bg-yellow-400 transition">공지 작성</button>
                      <button onClick={() => setShowKbManagement(true)} className="bg-brand-green text-white px-3 py-1 text-xs font-bold rounded-full hover:bg-green-600 transition">Q&A 정보 등록</button>
                      <button onClick={() => { setShowUserManagement(true); loadAllUsers(); }} className="bg-[#4a3a32] text-white px-3 py-1 text-xs font-bold rounded-full flex gap-1 items-center hover:bg-primary transition"><Users className="w-3 h-3"/>계정 관리</button>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {notices.length === 0 ? (
                    <p className="text-primary/40 text-sm text-center py-6">등록된 공지사항이 없습니다.</p>
                  ) : (
                    notices.slice(0, 5).map(notice => (
                      <button
                        key={notice.id}
                        onClick={() => handleViewNotice(notice)}
                        className="w-full bg-gray-50 p-3 rounded-xl text-left hover:bg-gray-100 transition-colors flex items-center justify-between"
                      >
                        <div>
                          <p className="font-medium text-primary text-sm">{notice.title}</p>
                          <p className="text-xs text-primary/40 mt-1">{formatDate(notice.createdAt)}</p>
                        </div>
                        <div className="flex items-center gap-2 text-primary/30">
                          <span className="text-xs flex items-center gap-1"><Eye className="w-3 h-3" />{notice.viewCount || 0}</span>
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>

              {/* Manual Grid */}
              <div>
                <h3 className="text-lg font-bold text-white mb-3 flex items-center gap-2 px-1">
                   📚 선비칼국수 매뉴얼
                </h3>
                
                <div className="grid grid-cols-2 gap-3 mb-2">
                   <button onClick={() => { setSelectedCategory(Category.RECIPE); document.getElementById('manual-search')?.scrollIntoView({behavior: 'smooth'}); }} className="bg-[#FDFAF6] p-4 rounded-2xl text-center shadow-sm hover:bg-white transition-colors flex flex-col items-center justify-center gap-3">
                     <FileText className="w-7 h-7 text-brand-green" />
                     <span className="font-bold text-sm text-primary">조리 매뉴얼</span>
                   </button>
                   <button onClick={() => { setSelectedCategory(Category.VIDEO); document.getElementById('manual-search')?.scrollIntoView({behavior: 'smooth'}); }} className="bg-[#FDFAF6] p-4 rounded-2xl text-center shadow-sm hover:bg-white transition-colors flex flex-col items-center justify-center gap-3">
                     <PlayCircle className="w-7 h-7 text-brand-green" />
                     <span className="font-bold text-sm text-primary">영상</span>
                   </button>
                   <button onClick={() => { setShowQaChat(true); }} className="bg-[#FDFAF6] p-4 rounded-2xl text-center shadow-sm hover:bg-white transition-colors flex flex-col items-center justify-center gap-3">
                     <ClipboardCheck className="w-7 h-7 text-brand-green" />
                     <span className="font-bold text-sm text-primary">선비칼국수 Q/A</span>
                   </button>
                   <button onClick={() => { setSelectedCategory(Category.CHECKLIST); document.getElementById('manual-search')?.scrollIntoView({behavior: 'smooth'}); }} className="bg-[#FDFAF6] p-4 rounded-2xl text-center shadow-sm hover:bg-white transition-colors flex flex-col items-center justify-center gap-3">
                     <Upload className="w-7 h-7 text-brand-green" />
                     <span className="font-bold text-sm text-primary">체크리스트 업로드</span>
                   </button>
                </div>

                {/* Sub-search section for manuals (hidden until scrolled to) */}
                <div id="manual-search" className="mt-6 bg-white/5 p-4 rounded-2xl">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-white">매뉴얼 목록</h4>
                    {isManager && (
                      <button onClick={() => setShowCreateManual(true)} className="text-xs text-brand-green flex items-center gap-1 font-bold bg-brand-green/10 px-2 py-1 rounded-md">
                        <Plus className="w-3 h-3" /> 작성
                      </button>
                    )}
                  </div>
                  <div className="relative mb-3">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-primary/40" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="검색..."
                      className="w-full pl-9 pr-4 py-2 rounded-xl bg-white border-0 focus:ring-2 focus:ring-accent text-sm text-primary font-bold"
                    />
                  </div>
                  <div className="flex gap-2 mb-3 overflow-x-auto pb-1 no-scrollbar">
                    <button
                      onClick={() => setSelectedCategory(null)}
                      className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${!selectedCategory ? 'bg-brand-green text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                    >전체</button>
                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                      <button
                        key={key}
                        onClick={() => setSelectedCategory(key as Category)}
                        className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${selectedCategory === key ? 'bg-brand-green text-white' : 'bg-white/20 text-white hover:bg-white/30'}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                     {filteredManuals.length === 0 ? (
                       <p className="col-span-2 text-white/40 text-xs text-center py-4 font-bold">등록된 매뉴얼이 없습니다.</p>
                     ) : (
                       filteredManuals.map(item => (
                         <button key={item.id} onClick={() => handleViewManual(item)} className="bg-white p-3 rounded-xl text-left shadow-sm flex flex-col justify-between hover:bg-gray-50 transition-colors">
                            <div className="text-xs font-bold text-brand-green mb-1">{CATEGORY_LABELS[item.category]}</div>
                            <p className="text-sm font-bold text-primary line-clamp-2 leading-tight">{item.title}</p>
                         </button>
                       ))
                     )}
                  </div>
                </div>
              </div>

              {/* Branch Map Section (Matches the bottom image) */}
              <div className="mt-4">
                <div className="bg-[#FDFBEA] rounded-2xl p-4 flex items-center justify-between shadow-sm">
                  <div className="flex items-center gap-3">
                     <div className="w-10 h-10 rounded-full bg-accent flex flex-col items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-primary" />
                     </div>
                     <div>
                       <p className="text-[10px] text-primary/60 font-bold mb-0.5">전국 지점 안내</p>
                       <p className="text-base font-bold text-primary leading-none">지점 리스트 보기</p>
                     </div>
                  </div>
                  <button onClick={() => setShowMap(true)} className="bg-accent px-4 py-2 rounded-xl text-sm font-bold text-primary shadow-sm hover:bg-yellow-400 shrink-0">
                    지도 보기
                  </button>
                </div>
              </div>
            </motion.div>
          )}

          {/* ===== CONSULTING TAB ===== */}
          {activeTab === 'consulting' && (
            <motion.div
              key="consulting"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
            >
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-primary">1:1 문의</h2>
                <button
                  onClick={() => setShowCreatePost(true)}
                  className="bg-primary text-white px-4 py-2 rounded-xl text-sm font-medium flex items-center gap-1 hover:bg-primary/90 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  문의하기
                </button>
              </div>

              {/* Filter */}
              <div className="flex gap-2 mb-4 overflow-x-auto pb-1">
                {[
                  { key: 'all', label: '전체' },
                  { key: 'pending', label: '대기중' },
                  { key: 'answered', label: '답변완료' },
                  { key: 'mine', label: '내 문의' },
                ].map(filter => (
                  <button
                    key={filter.key}
                    onClick={() => setConsultingFilter(filter.key)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
                      consultingFilter === filter.key ? 'bg-primary text-white' : 'bg-white text-primary/60 hover:bg-primary/10'
                    }`}
                  >
                    {filter.label}
                  </button>
                ))}
              </div>

              {/* Posts List */}
              <div className="space-y-3">
                {filteredPosts.length === 0 ? (
                  <p className="text-primary/40 text-sm text-center py-8">문의 내역이 없습니다.</p>
                ) : (
                  filteredPosts.map(post => (
                    <button
                      key={post.id}
                      onClick={() => setSelectedPost(post)}
                      className="w-full bg-white p-4 rounded-xl text-left hover:shadow-md transition-shadow"
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          post.status === 'answered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                        }`}>
                          {post.status === 'answered' ? '답변완료' : '대기중'}
                        </span>
                        <span className="text-xs text-primary/40 bg-primary/5 px-2 py-0.5 rounded-full">{post.category}</span>
                      </div>
                      <p className="font-medium text-primary">{post.title}</p>
                      <div className="flex items-center gap-2 mt-2 text-xs text-primary/40">
                        <span>{post.storeName} - {post.author}</span>
                        <span>{formatDate(post.createdAt)}</span>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ===== MODALS ===== */}

      {/* Post Detail Modal */}
      <AnimatePresence>
        {selectedPost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelectedPost(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      selectedPost.status === 'answered' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                      {selectedPost.status === 'answered' ? '답변완료' : '대기중'}
                    </span>
                    <span className="text-xs text-primary/40">{selectedPost.category}</span>
                  </div>
                  <button onClick={() => setSelectedPost(null)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <h3 className="text-lg font-bold text-primary mb-2">{selectedPost.title}</h3>
                <p className="text-xs text-primary/40 mb-4">{selectedPost.storeName} - {selectedPost.author} | {formatDate(selectedPost.createdAt)}</p>
                <div className="bg-amber-50 p-4 rounded-xl mb-4">
                  <p className="text-sm text-primary whitespace-pre-wrap">{selectedPost.content}</p>
                </div>

                {selectedPost.answer && (
                  <div className="bg-green-50 p-4 rounded-xl mb-4">
                    <p className="text-xs font-bold text-green-700 mb-2 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" />
                      답변 ({selectedPost.answeredBy} | {selectedPost.answeredAt && formatDate(selectedPost.answeredAt)})
                    </p>
                    <p className="text-sm text-green-900 whitespace-pre-wrap">{selectedPost.answer}</p>
                  </div>
                )}

                {/* Manager: Answer Form */}
                {isManager && selectedPost.status === 'pending' && (
                  <div className="mt-4">
                    <textarea
                      value={answerText}
                      onChange={(e) => setAnswerText(e.target.value)}
                      placeholder="답변을 입력하세요..."
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm min-h-[100px]"
                    />
                    <button
                      onClick={() => handleAnswerPost(selectedPost.id)}
                      className="mt-2 bg-green-600 text-white px-4 py-2 rounded-xl text-sm font-medium hover:bg-green-700 transition-colors w-full"
                    >
                      답변 등록
                    </button>
                  </div>
                )}

                {/* Delete button for manager or post author */}
                {(isManager || selectedPost.authorUid === user?.id) && (
                  <button
                    onClick={() => handleDeletePost(selectedPost.id)}
                    className="mt-3 text-[#5d4037]/70 text-sm flex items-center gap-1 hover:text-[#5d4037]"
                  >
                    <Trash2 className="w-4 h-4" />
                    삭제
                  </button>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Post Modal */}
      <AnimatePresence>
        {showCreatePost && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowCreatePost(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">1:1 문의하기</h3>
                  <button onClick={() => setShowCreatePost(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">카테고리</label>
                    <select
                      value={newPost.category}
                      onChange={(e) => setNewPost({ ...newPost, category: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    >
                      <option value="운영">운영</option>
                      <option value="식재료">식재료</option>
                      <option value="시설/설비">시설/설비</option>
                      <option value="인사/노무">인사/노무</option>
                      <option value="마케팅">마케팅</option>
                      <option value="기타">기타</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">제목</label>
                    <input
                      type="text"
                      value={newPost.title}
                      onChange={(e) => setNewPost({ ...newPost, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="제목을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">내용</label>
                    <textarea
                      value={newPost.content}
                      onChange={(e) => setNewPost({ ...newPost, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm min-h-[120px]"
                      placeholder="문의 내용을 입력하세요"
                    />
                  </div>
                  <button
                    onClick={handleCreatePost}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    문의 등록
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Notice Detail Modal */}
      <AnimatePresence>
        {showNoticeModal && selectedNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => { setShowNoticeModal(false); setSelectedNotice(null); }}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">{selectedNotice.title}</h3>
                  <button onClick={() => { setShowNoticeModal(false); setSelectedNotice(null); }}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <p className="text-xs text-primary/40 mb-4">{selectedNotice.author} | {formatDate(selectedNotice.createdAt)} | 조회 {selectedNotice.viewCount || 0}</p>
                <div className="bg-amber-50 p-4 rounded-xl">
                  <p className="text-sm text-primary whitespace-pre-wrap">{selectedNotice.content}</p>
                </div>

                {isManager && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        setEditNotice({ id: selectedNotice.id, title: selectedNotice.title, content: selectedNotice.content });
                        setShowEditNotice(true);
                      }}
                      className="flex items-center gap-1 text-sm text-primary/60 hover:text-primary"
                    >
                      <Edit className="w-4 h-4" />
                      수정
                    </button>
                    <button
                      onClick={() => {
                        setDeleteNoticeId(selectedNotice.id);
                        setShowDeleteNoticeConfirm(true);
                      }}
                      className="flex items-center gap-1 text-sm text-[#5d4037]/70 hover:text-[#5d4037]"
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Notice Modal */}
      <AnimatePresence>
        {showCreateNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowCreateNotice(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">공지사항 작성</h3>
                  <button onClick={() => setShowCreateNotice(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">제목</label>
                    <input
                      type="text"
                      value={newNotice.title}
                      onChange={(e) => setNewNotice({ ...newNotice, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="제목을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">내용</label>
                    <textarea
                      value={newNotice.content}
                      onChange={(e) => setNewNotice({ ...newNotice, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm min-h-[150px]"
                      placeholder="내용을 입력하세요"
                    />
                  </div>
                  <button
                    onClick={handleCreateNotice}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Notice Modal */}
      <AnimatePresence>
        {showEditNotice && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowEditNotice(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">공지사항 수정</h3>
                  <button onClick={() => setShowEditNotice(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">제목</label>
                    <input
                      type="text"
                      value={editNotice.title}
                      onChange={(e) => setEditNotice({ ...editNotice, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">내용</label>
                    <textarea
                      value={editNotice.content}
                      onChange={(e) => setEditNotice({ ...editNotice, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm min-h-[150px]"
                    />
                  </div>
                  <button
                    onClick={handleEditNotice}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    수정 완료
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Notice Confirm Modal */}
      <AnimatePresence>
        {showDeleteNoticeConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteNoticeConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-primary mb-2">공지사항 삭제</h3>
              <p className="text-sm text-primary/60 mb-4">정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteNoticeConfirm(false)}
                  className="flex-1 py-2 rounded-xl border border-primary/20 text-sm font-medium text-primary/60 hover:bg-primary/5"
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteNotice}
                  className="flex-1 py-2 rounded-xl bg-[#5d4037] text-white text-sm font-medium hover:bg-[#4e342e]"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Business Registration Modal */}
      <AnimatePresence>
        {showBusinessReg && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowBusinessReg(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">사업자 등록</h3>
                  <button onClick={() => setShowBusinessReg(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">상호명</label>
                    <input
                      type="text"
                      value={businessRegForm.businessName}
                      onChange={(e) => setBusinessRegForm({ ...businessRegForm, businessName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="상호명"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">대표자명</label>
                    <input
                      type="text"
                      value={businessRegForm.ownerName}
                      onChange={(e) => setBusinessRegForm({ ...businessRegForm, ownerName: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="대표자명"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">사업자등록번호</label>
                    <input
                      type="text"
                      value={businessRegForm.businessNumber}
                      onChange={(e) => setBusinessRegForm({ ...businessRegForm, businessNumber: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="000-00-00000"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">주소</label>
                    <input
                      type="text"
                      value={businessRegForm.address}
                      onChange={(e) => setBusinessRegForm({ ...businessRegForm, address: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="사업장 주소"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">연락처</label>
                    <input
                      type="tel"
                      value={businessRegForm.phone}
                      onChange={(e) => setBusinessRegForm({ ...businessRegForm, phone: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="010-0000-0000"
                    />
                  </div>
                  <button
                    onClick={async () => {
                      try {
                        await supabase.from('business_registrations').insert({
                          ...businessRegForm,
                          created_at: new Date().toISOString(),
                          registered_by: userProfile?.name,
                        });
                        setBusinessRegForm({ businessName: '', ownerName: '', businessNumber: '', address: '', phone: '' });
                        setShowBusinessReg(false);
                        alert('사업자 등록이 완료되었습니다.');
                      } catch (error) {
                        console.error('Error registering business:', error);
                      }
                    }}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    등록
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Map Modal */}
      <AnimatePresence>
        {showMap && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowMap(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-2xl h-[70vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-4 flex items-center justify-between border-b">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <MapPin className="w-5 h-5" />
                  가맹점 지도 ({BRANCHES.length}개)
                </h3>
                <button onClick={() => setShowMap(false)}>
                  <X className="w-5 h-5 text-primary/40" />
                </button>
              </div>
              <div style={{ height: '45%' }}>
                <MapContainer
                  center={[37.0, 127.5]}
                  zoom={7}
                  style={{ height: '100%', width: '100%' }}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {BRANCHES.map((branch, index) => (
                    <Marker key={index} position={[branch.lat, branch.lng]}>
                      <Popup>
                        <strong>선비칼국수 {branch.name}</strong><br/>
                        <span style={{fontSize: '11px', color: '#666'}}>{branch.address}</span>
                      </Popup>
                    </Marker>
                  ))}
                </MapContainer>
              </div>
              <div className="flex-1 overflow-y-auto border-t">
                <div className="p-3">
                  <h4 className="text-sm font-bold text-primary mb-2">전체 가맹점 리스트</h4>
                  <div className="space-y-2">
                    {BRANCHES.map((branch, index) => (
                      <div key={index} className="flex items-start gap-2.5 bg-amber-50 p-3 rounded-lg">
                        <MapPin className="w-4 h-4 text-brand-green shrink-0 mt-0.5" />
                        <div className="min-w-0">
                          <p className="text-sm font-bold text-primary">선비칼국수 {branch.name}</p>
                          <p className="text-xs text-primary/50 mt-0.5 break-words">{branch.address}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SOS Modal */}
      <AnimatePresence>
        {showSosModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowSosModal(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-[#5d4037]/70 flex items-center gap-2">
                    <AlertCircle className="w-5 h-5" />
                    SOS 긴급문의
                  </h3>
                  <button onClick={() => setShowSosModal(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>

                {sosSuccess ? (
                  <div className="text-center py-8">
                    <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
                    <p className="text-lg font-bold text-primary">접수되었습니다!</p>
                    <p className="text-sm text-primary/60 mt-2">슈퍼바이저가 곧 연락드리겠습니다.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-primary/60 bg-red-50 p-3 rounded-xl">
                      긴급한 상황을 슈퍼바이저에게 바로 전달합니다. 접수 후 빠르게 연락드리겠습니다.
                    </p>
                    <div>
                      <label className="block text-sm font-medium text-primary/70 mb-1">제목</label>
                      <input
                        type="text"
                        value={sosForm.title}
                        onChange={(e) => setSosForm({ ...sosForm, title: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-[#ffeb3b] text-sm"
                        placeholder="긴급 상황을 간단히 입력"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-primary/70 mb-1">상세 내용</label>
                      <textarea
                        value={sosForm.message}
                        onChange={(e) => setSosForm({ ...sosForm, message: e.target.value })}
                        className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-[#ffeb3b] text-sm min-h-[100px]"
                        placeholder="상황을 자세히 설명해 주세요"
                      />
                    </div>
                    <button
                      onClick={handleSosSubmit}
                      disabled={sosLoading || !sosForm.title || !sosForm.message}
                      className="w-full bg-[#5d4037] text-white py-3 rounded-xl font-bold hover:bg-[#4e342e] transition-colors disabled:opacity-50"
                    >
                      {sosLoading ? '전송 중...' : '긴급 문의 접수'}
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* A/S Contacts Modal */}
      <AnimatePresence>
        {showAsContacts && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowAsContacts(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    A/S 연락처
                  </h3>
                  <button onClick={() => setShowAsContacts(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-3">
                  {[
                    { label: '포스기 (POS)', phone: '010-5448-2724', desc: 'POS 시스템 관련 문의' },
                    { label: '주방설비', phone: '010-9275-0977', desc: '주방 장비 수리/점검' },
                    { label: '인테리어', phone: '010-9851-8451', desc: '매장 인테리어/시설' },
                  ].map((contact, index) => (
                    <a
                      key={index}
                      href={`tel:${contact.phone}`}
                      className="flex items-center gap-4 bg-amber-50 p-4 rounded-xl hover:bg-amber-100 transition-colors"
                    >
                      <div className="w-10 h-10 bg-primary rounded-full flex items-center justify-center shrink-0">
                        <Phone className="w-5 h-5 text-white" />
                      </div>
                      <div className="flex-1">
                        <p className="font-bold text-primary">{contact.label}</p>
                        <p className="text-sm text-primary/60">{contact.desc}</p>
                      </div>
                      <p className="text-sm font-bold text-primary">{contact.phone}</p>
                    </a>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Manual Viewer Modal */}
      <AnimatePresence>
        {selectedManual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setSelectedManual(null)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2 text-primary/60">
                    {getCategoryIcon(selectedManual.category)}
                    <span className="text-sm">{CATEGORY_LABELS[selectedManual.category]}</span>
                  </div>
                  <button onClick={() => setSelectedManual(null)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>

                <h3 className="text-lg font-bold text-primary mb-2">{selectedManual.title}</h3>
                <p className="text-xs text-primary/40 mb-4">
                  {selectedManual.author} | {formatDate(selectedManual.createdAt)} | 조회 {selectedManual.viewCount || 0}
                </p>

                {/* Image */}
                {selectedManual.imageUrl && (
                  <div className="mb-4">
                    <img src={selectedManual.imageUrl} alt={selectedManual.title} className="w-full rounded-xl" />
                  </div>
                )}

                {/* Video */}
                {selectedManual.videoUrl && (
                  <div className="mb-4">
                    {selectedManual.videoUrl.includes('youtube.com') || selectedManual.videoUrl.includes('youtu.be') ? (
                      <div className="aspect-video rounded-xl overflow-hidden">
                        <iframe
                          src={selectedManual.videoUrl.replace('watch?v=', 'embed/').replace('youtu.be/', 'youtube.com/embed/')}
                          className="w-full h-full"
                          allowFullScreen
                        />
                      </div>
                    ) : (
                      <video src={selectedManual.videoUrl} controls className="w-full rounded-xl" />
                    )}
                  </div>
                )}

                {/* File Download */}
                {selectedManual.fileUrl && (
                  <a
                    href={selectedManual.fileUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 bg-amber-50 p-3 rounded-xl mb-4 hover:bg-amber-100 transition-colors"
                  >
                    <Download className="w-5 h-5 text-primary" />
                    <span className="text-sm font-medium text-primary">{selectedManual.fileName || '파일 다운로드'}</span>
                  </a>
                )}

                {/* Content */}
                <div className="bg-amber-50 p-4 rounded-xl">
                  <div className="text-sm text-primary whitespace-pre-wrap markdown-body">
                    <Markdown>{selectedManual.content}</Markdown>
                  </div>
                </div>

                {/* Manager Actions */}
                {isManager && (
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => {
                        setEditManual({
                          id: selectedManual.id,
                          category: selectedManual.category,
                          title: selectedManual.title,
                          content: selectedManual.content,
                          imageUrl: selectedManual.imageUrl || '',
                          videoUrl: selectedManual.videoUrl || '',
                        });
                        setShowEditManual(true);
                      }}
                      className="flex items-center gap-1 text-sm text-primary/60 hover:text-primary"
                    >
                      <Edit className="w-4 h-4" />
                      수정
                    </button>
                    <button
                      onClick={() => {
                        setDeleteManualId(selectedManual.id);
                        setShowDeleteManualConfirm(true);
                      }}
                      className="flex items-center gap-1 text-sm text-[#5d4037]/70 hover:text-[#5d4037]"
                    >
                      <Trash2 className="w-4 h-4" />
                      삭제
                    </button>
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Manual Modal */}
      <AnimatePresence>
        {showCreateManual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowCreateManual(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">매뉴얼 작성</h3>
                  <button onClick={() => setShowCreateManual(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">카테고리</label>
                    <select
                      value={newManual.category}
                      onChange={(e) => setNewManual({ ...newManual, category: e.target.value as Category })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">제목</label>
                    <input
                      type="text"
                      value={newManual.title}
                      onChange={(e) => setNewManual({ ...newManual, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="제목을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">내용 (마크다운 지원)</label>
                    <textarea
                      value={newManual.content}
                      onChange={(e) => setNewManual({ ...newManual, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm min-h-[150px] font-mono"
                      placeholder="내용을 입력하세요"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">이미지 URL (선택)</label>
                    <input
                      type="url"
                      value={newManual.imageUrl}
                      onChange={(e) => setNewManual({ ...newManual, imageUrl: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="https://..."
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">영상 URL (선택)</label>
                    <input
                      type="url"
                      value={newManual.videoUrl}
                      onChange={(e) => setNewManual({ ...newManual, videoUrl: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                      placeholder="YouTube URL 또는 영상 URL"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">파일 첨부 (선택)</label>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-2 px-4 py-2 rounded-xl border border-dashed border-primary/30 cursor-pointer hover:bg-amber-50 transition-colors">
                        <Upload className="w-4 h-4 text-primary/60" />
                        <span className="text-sm text-primary/60">{manualFile ? manualFile.name : '파일 선택'}</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => setManualFile(e.target.files?.[0] || null)}
                        />
                      </label>
                      {manualFile && (
                        <button onClick={() => setManualFile(null)} className="text-[#5d4037]/60 hover:text-[#5d4037]/70">
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                    {isUploading && (
                      <div className="mt-2">
                        <div className="w-full bg-primary/10 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full transition-all"
                            style={{ width: `${uploadProgress}%` }}
                          />
                        </div>
                        <p className="text-xs text-primary/40 mt-1">{Math.round(uploadProgress)}% 업로드 중...</p>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={handleCreateManual}
                    disabled={isUploading || !newManual.title || !newManual.content}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    {isUploading ? '업로드 중...' : '등록'}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Manual Modal */}
      <AnimatePresence>
        {showEditManual && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowEditManual(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary">매뉴얼 수정</h3>
                  <button onClick={() => setShowEditManual(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">카테고리</label>
                    <select
                      value={editManual.category}
                      onChange={(e) => setEditManual({ ...editManual, category: e.target.value as Category })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    >
                      {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                        <option key={key} value={key}>{label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">제목</label>
                    <input
                      type="text"
                      value={editManual.title}
                      onChange={(e) => setEditManual({ ...editManual, title: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">내용</label>
                    <textarea
                      value={editManual.content}
                      onChange={(e) => setEditManual({ ...editManual, content: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm min-h-[150px] font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">이미지 URL (선택)</label>
                    <input
                      type="url"
                      value={editManual.imageUrl}
                      onChange={(e) => setEditManual({ ...editManual, imageUrl: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-primary/70 mb-1">영상 URL (선택)</label>
                    <input
                      type="url"
                      value={editManual.videoUrl}
                      onChange={(e) => setEditManual({ ...editManual, videoUrl: e.target.value })}
                      className="w-full px-4 py-3 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm"
                    />
                  </div>
                  <button
                    onClick={handleEditManual}
                    className="w-full bg-primary text-white py-3 rounded-xl font-bold hover:bg-primary/90 transition-colors"
                  >
                    수정 완료
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Delete Manual Confirm Modal */}
      <AnimatePresence>
        {showDeleteManualConfirm && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
            onClick={() => setShowDeleteManualConfirm(false)}
          >
            <motion.div
              initial={{ scale: 0.9 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.9 }}
              className="bg-white rounded-2xl p-6 w-full max-w-sm"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="text-lg font-bold text-primary mb-2">매뉴얼 삭제</h3>
              <p className="text-sm text-primary/60 mb-4">정말 삭제하시겠습니까? 이 작업은 되돌릴 수 없습니다.</p>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowDeleteManualConfirm(false)}
                  className="flex-1 py-2 rounded-xl border border-primary/20 text-sm font-medium text-primary/60 hover:bg-primary/5"
                >
                  취소
                </button>
                <button
                  onClick={handleDeleteManual}
                  className="flex-1 py-2 rounded-xl bg-[#5d4037] text-white text-sm font-medium hover:bg-[#4e342e]"
                >
                  삭제
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Q&A Chat Modal */}
      <AnimatePresence>
        {showQaChat && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowQaChat(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg h-[80vh] flex flex-col"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Chat Header */}
              <div className="p-4 border-b flex items-center justify-between">
                <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                  <MessageSquare className="w-5 h-5" />
                  선비칼국수 Q&A
                </h3>
                <button onClick={() => setShowQaChat(false)}>
                  <X className="w-5 h-5 text-primary/40" />
                </button>
              </div>

              {/* Chat Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {qaMessages.length === 0 && (
                  <div className="text-center py-8">
                    <Leaf className="w-12 h-12 text-primary/20 mx-auto mb-3" />
                    <p className="text-primary/40 text-sm">무엇이든 물어보세요!</p>
                    <p className="text-primary/30 text-xs mt-1">선비칼국수 운영에 관한 궁금한 점을 질문해 주세요.</p>
                  </div>
                )}
                {qaMessages.map((msg, index) => (
                  <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-[80%] p-3 rounded-xl text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-white rounded-br-sm'
                        : 'bg-amber-50 text-primary rounded-bl-sm'
                    }`}>
                      {msg.role === 'assistant' ? (
                        <div className="markdown-body">
                          <Markdown>{msg.content.replace('[ESCALATE]', '')}</Markdown>
                          {msg.content.includes('[ESCALATE]') && (
                            <button
                              onClick={() => {
                                setShowQaChat(false);
                                setShowSosModal(true);
                              }}
                              className="mt-2 bg-[#5d4037] text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-[#4e342e] transition-colors flex items-center gap-1"
                            >
                              <AlertCircle className="w-3 h-3" />
                              슈퍼바이저 1:1 문의하기
                            </button>
                          )}
                        </div>
                      ) : (
                        <p>{msg.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {qaLoading && (
                  <div className="flex justify-start">
                    <div className="bg-amber-50 p-3 rounded-xl rounded-bl-sm">
                      <div className="flex gap-1">
                        <div className="w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <div className="w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <div className="w-2 h-2 bg-primary/30 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <div className="p-4 border-t">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={qaInput}
                    onChange={(e) => setQaInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleQaSubmit(); } }}
                    placeholder="질문을 입력하세요..."
                    className="flex-1 px-4 py-2.5 rounded-xl border border-primary/20 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm text-primary"
                    disabled={qaLoading}
                  />
                  <button
                    onClick={handleQaSubmit}
                    disabled={qaLoading || !qaInput.trim()}
                    className="bg-primary text-white p-2.5 rounded-xl hover:bg-primary/90 transition-colors disabled:opacity-50"
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* User Management Modal */}
      <AnimatePresence>
        {showUserManagement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowUserManagement(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    계정 관리
                  </h3>
                  <button onClick={() => setShowUserManagement(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>

                {/* Create User Form */}
                <div className="bg-amber-50 p-4 rounded-xl mb-4">
                  <h4 className="font-bold text-primary mb-3">새 계정 생성</h4>
                  {createUserError && (
                    <div className="bg-[#5d4037]/10 text-[#5d4037] p-2 rounded-lg mb-3 text-xs flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      {createUserError}
                    </div>
                  )}
                  <div className="space-y-3">
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">지점명 *</label>
                      <input
                        type="text"
                        value={createUserForm.storeName}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, storeName: e.target.value })}
                        placeholder="예: 강남점"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">이름 (대표자명) *</label>
                      <input
                        type="text"
                        value={createUserForm.name}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, name: e.target.value })}
                        placeholder="대표자 이름"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">사업자등록번호</label>
                      <input
                        type="text"
                        value={createUserForm.businessNumber}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, businessNumber: e.target.value })}
                        placeholder="000-00-00000"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">계산서 발행 이메일 *</label>
                      <input
                        type="email"
                        value={createUserForm.invoiceEmail}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, invoiceEmail: e.target.value })}
                        placeholder="세금계산서 수신 이메일"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">연락처</label>
                      <input
                        type="tel"
                        value={createUserForm.phone}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, phone: e.target.value })}
                        placeholder="010-0000-0000"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">로그인 이메일 *</label>
                      <input
                        type="email"
                        value={createUserForm.email}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, email: e.target.value })}
                        placeholder="로그인용 이메일"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-primary/70 mb-1">비밀번호</label>
                      <input
                        type="password"
                        value={createUserForm.password}
                        onChange={(e) => setCreateUserForm({ ...createUserForm, password: e.target.value })}
                        placeholder="미입력시 기본값: sunbi1234"
                        className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                      />
                    </div>
                    <select
                      value={createUserForm.role}
                      onChange={(e) => setCreateUserForm({ ...createUserForm, role: e.target.value as 'manager' | 'owner' })}
                      className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm text-primary"
                    >
                      <option value="owner">점주 (owner)</option>
                      <option value="manager">관리자 (manager)</option>
                    </select>
                    <button
                      onClick={handleCreateUser}
                      disabled={createUserLoading || !createUserForm.storeName || !createUserForm.name || !createUserForm.email}
                      className="w-full bg-primary text-white py-2.5 rounded-lg text-sm font-bold hover:bg-primary/90 disabled:opacity-50"
                    >
                      {createUserLoading ? '등록 중...' : '계정 등록'}
                    </button>
                  </div>
                </div>

                {/* Users List */}
                <h4 className="font-bold text-primary mb-2">등록된 계정 ({allUsers.length})</h4>
                <div className="space-y-2">
                  {allUsers.map((u, index) => (
                    <div key={index} className="bg-white border border-primary/10 p-3 rounded-xl">
                      <div className="flex items-center justify-between mb-1">
                        <div>
                          <p className="font-medium text-primary text-sm">{u.storeName} — {u.name}</p>
                          <p className="text-xs text-primary/40">{u.email}</p>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          u.role === 'manager' ? 'bg-[#ffeb3b]/30 text-[#5d4037]' : 'bg-blue-100 text-blue-700'
                        }`}>
                          {u.role === 'manager' ? '관리자' : '점주'}
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-primary/50">
                        {u.businessNumber && <span>사업자: {u.businessNumber}</span>}
                        {u.invoiceEmail && <span>계산서: {u.invoiceEmail}</span>}
                        {u.phone && <span>연락처: {u.phone}</span>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KB Management Modal */}
      <AnimatePresence>
        {showKbManagement && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-50 flex items-end sm:items-center justify-center p-4"
            onClick={() => setShowKbManagement(false)}
          >
            <motion.div
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              exit={{ y: 100 }}
              className="bg-white rounded-t-2xl sm:rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-lg font-bold text-primary flex items-center gap-2">
                    <FileText className="w-5 h-5" />
                    지식베이스 관리
                  </h3>
                  <button onClick={() => setShowKbManagement(false)}>
                    <X className="w-5 h-5 text-primary/40" />
                  </button>
                </div>

                {/* Manual Entry */}
                <div className="bg-amber-50 p-4 rounded-xl mb-4">
                  <h4 className="font-bold text-primary mb-3">항목 추가</h4>
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={kbNewEntry.question}
                      onChange={(e) => setKbNewEntry({ ...kbNewEntry, question: e.target.value })}
                      placeholder="질문"
                      className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm"
                    />
                    <textarea
                      value={kbNewEntry.answer}
                      onChange={(e) => setKbNewEntry({ ...kbNewEntry, answer: e.target.value })}
                      placeholder="답변"
                      className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm min-h-[80px]"
                    />
                    <input
                      type="text"
                      value={kbNewEntry.category}
                      onChange={(e) => setKbNewEntry({ ...kbNewEntry, category: e.target.value })}
                      placeholder="카테고리 (선택)"
                      className="w-full px-3 py-2 rounded-lg border border-primary/20 text-sm"
                    />
                    <button
                      onClick={handleKbAddEntry}
                      className="w-full bg-primary text-white py-2 rounded-lg text-sm font-medium hover:bg-primary/90"
                    >
                      추가
                    </button>
                  </div>
                </div>

                {/* CSV Upload */}
                <div className="bg-[#8bc34a]/10 p-4 rounded-xl mb-4">
                  <h4 className="font-bold text-primary mb-3">CSV 일괄 업로드</h4>
                  <p className="text-xs text-primary/50 mb-3">CSV 파일에 question, answer, category (선택) 열이 필요합니다.</p>
                  <div className="flex items-center gap-2 mb-3">
                    <label className="flex items-center gap-2 px-4 py-2 rounded-lg border border-dashed border-primary/30 cursor-pointer hover:bg-[#8bc34a]/20 transition-colors">
                      <Upload className="w-4 h-4 text-primary/60" />
                      <span className="text-sm text-primary/60">{kbCsvFile ? kbCsvFile.name : 'CSV 파일 선택'}</span>
                      <input
                        type="file"
                        accept=".csv"
                        className="hidden"
                        onChange={(e) => setKbCsvFile(e.target.files?.[0] || null)}
                      />
                    </label>
                  </div>
                  <button
                    onClick={handleKbCsvUpload}
                    disabled={!kbCsvFile || kbUploadLoading}
                    className="w-full bg-[#8bc34a] text-white py-2 rounded-lg text-sm font-medium hover:bg-[#7cb342] disabled:opacity-50"
                  >
                    {kbUploadLoading ? '업로드 중...' : '업로드'}
                  </button>
                </div>

                {kbUploadResult && (
                  <div className="bg-green-50 text-green-700 p-3 rounded-xl text-sm flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4" />
                    {kbUploadResult}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
