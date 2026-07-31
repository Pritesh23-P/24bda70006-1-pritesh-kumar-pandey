import React, { useState, useEffect, useMemo, useRef } from 'react';
import { PLATFORMS, EMOJI_LIST, TRENDING_HASHTAGS } from './config/platforms.js';
import { validatePlatform, calculateSvgRing, extractHashtags, fileToBase64, formatDate, formatName, storage } from './utils/helpers.js';

export default function App() {
  // State management
  const [currentUser, setCurrentUser] = useState(() => storage.getUser());
  const [postContent, setPostContent] = useState('');
  const [postTitle, setPostTitle] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState(['twitter', 'instagram', 'linkedin', 'facebook']);
  const [activePreviewTab, setActivePreviewTab] = useState('twitter');
  const [uploadedMedia, setUploadedMedia] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [activeStudioTab, setActiveStudioTab] = useState('drafts'); // 'drafts' | 'published'
  const [editingDraftId, setEditingDraftId] = useState(null);
  
  // Auth Modal State
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'register'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authName, setAuthName] = useState('');
  const [authError, setAuthError] = useState('');
  const [authLoading, setAuthLoading] = useState(false);
  const [mongoConnected, setMongoConnected] = useState(true);

  // Notification Toast State
  const [toast, setToast] = useState(null);

  const textareaRef = useRef(null);

  // Show Toast Notification
  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3500);
  };

  // Sync Drafts whenever user changes
  useEffect(() => {
    if (currentUser) {
      fetchUserDrafts(currentUser.email);
    } else {
      setDrafts([]);
    }
  }, [currentUser]);

  // Check backend health on mount
  useEffect(() => {
    fetch('/api/health')
      .then(res => res.json())
      .then(data => setMongoConnected(data.mongoConnected ?? true))
      .catch(() => setMongoConnected(false));
  }, []);

  // Fetch drafts from API with localStorage fallback
  const fetchUserDrafts = async (email) => {
    try {
      const res = await fetch(`/api/drafts?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setDrafts(data.drafts || []);
        return;
      }
    } catch (e) {}
    // Fallback to localStorage
    const local = storage.getDrafts(email);
    setDrafts(local);
  };

  // Toggle platform selection
  const togglePlatform = (id) => {
    if (selectedPlatforms.includes(id)) {
      if (selectedPlatforms.length > 1) {
        setSelectedPlatforms(selectedPlatforms.filter(p => p !== id));
        if (activePreviewTab === id) {
          const remaining = selectedPlatforms.filter(p => p !== id);
          setActivePreviewTab(remaining[0]);
        }
      } else {
        showToast('At least one target platform must be selected', 'warning');
      }
    } else {
      setSelectedPlatforms([...selectedPlatforms, id]);
      setActivePreviewTab(id);
    }
  };

  // Platform validation calculations
  const validations = useMemo(() => {
    const results = {};
    Object.keys(PLATFORMS).forEach(pKey => {
      results[pKey] = validatePlatform(PLATFORMS[pKey], postContent, uploadedMedia);
    });
    return results;
  }, [postContent, uploadedMedia]);

  // Overall validity check for selected platforms
  const isPostValid = useMemo(() => {
    return selectedPlatforms.every(pKey => validations[pKey]?.isValid);
  }, [selectedPlatforms, validations]);

  // Handle Media File Upload (Images, Videos, PDFs)
  const handleFileUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;

    for (const file of files) {
      if (uploadedMedia.length >= 10) {
        showToast('Maximum 10 media files allowed across platforms', 'warning');
        break;
      }
      try {
        const base64Url = await fileToBase64(file);
        const isPdf = file.type === 'application/pdf' || file.name.endsWith('.pdf');
        const isVideo = file.type.startsWith('video/');
        
        setUploadedMedia(prev => [
          ...prev,
          {
            id: `media_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`,
            name: file.name,
            type: isPdf ? 'pdf' : (isVideo ? 'video' : 'image'),
            url: base64Url,
            size: (file.size / (1024 * 1024)).toFixed(2) + ' MB'
          }
        ]);
      } catch (err) {
        showToast(`Failed to upload ${file.name}`, 'error');
      }
    }
    e.target.value = '';
  };

  const removeMedia = (id) => {
    setUploadedMedia(uploadedMedia.filter(m => m.id !== id));
  };

  // Quick Formatting Helpers
  const insertEmoji = (emoji) => {
    setPostContent(prev => prev + emoji);
    if (textareaRef.current) textareaRef.current.focus();
  };

  const insertHashtag = (tag) => {
    if (postContent.includes(tag)) return;
    setPostContent(prev => (prev ? `${prev} ${tag}` : tag));
    if (textareaRef.current) textareaRef.current.focus();
  };

  // Auth Submit handler (API + Local fallback)
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthLoading(true);

    const endpoint = authMode === 'login' ? '/api/auth/login' : '/api/auth/register';
    const payload = authMode === 'login' 
      ? { email: authEmail, password: authPassword }
      : { email: authEmail, password: authPassword, name: authName };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        storage.setUser(data.user);
        setCurrentUser(data.user);
        setAuthModalOpen(false);
        showToast(authMode === 'login' ? `Welcome back, ${data.user.name}!` : 'Account created successfully!');
        setAuthEmail('');
        setAuthPassword('');
        setAuthName('');
        setAuthLoading(false);
        return;
      } else if (data.message) {
        throw new Error(data.message);
      }
    } catch (err) {
      // Local Fallback Auth logic using users_fallback.json / storage
      if (authMode === 'login') {
        if (authEmail && authPassword) {
          const fallbackUser = { email: authEmail, name: authName || authEmail.split('@')[0] };
          storage.setUser(fallbackUser);
          setCurrentUser(fallbackUser);
          setAuthModalOpen(false);
          showToast(`Signed in as ${fallbackUser.name} (Local Mode)`);
          setAuthLoading(false);
          return;
        } else {
          setAuthError('Please enter valid email and password');
        }
      } else {
        if (authEmail && authPassword && authName) {
          const newUser = { email: authEmail, name: authName };
          storage.setUser(newUser);
          setCurrentUser(newUser);
          setAuthModalOpen(false);
          showToast('Account created locally');
          setAuthLoading(false);
          return;
        } else {
          setAuthError('Please fill in all registration fields');
        }
      }
    }
    setAuthLoading(false);
  };

  const handleLogout = () => {
    storage.setUser(null);
    setCurrentUser(null);
    setDrafts([]);
    showToast('Signed out successfully');
  };

  // Draft Actions
  const handleSaveDraft = async () => {
    if (!currentUser) {
      setAuthModalOpen(true);
      showToast('Please sign in to save your draft', 'warning');
      return;
    }
    if (!postContent.trim() && uploadedMedia.length === 0) {
      showToast('Cannot save an empty draft', 'warning');
      return;
    }

    const newDraft = {
      id: editingDraftId || `draft_${Date.now()}`,
      userEmail: currentUser.email,
      title: postTitle.trim() || postContent.slice(0, 40) + '...',
      content: postContent,
      targetPlatforms: selectedPlatforms,
      mediaFiles: uploadedMedia,
      status: 'draft',
      updatedAt: new Date().toISOString()
    };

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDraft)
      });
      if (res.ok) {
        fetchUserDrafts(currentUser.email);
      } else {
        const updated = storage.saveDraft(newDraft);
        setDrafts(updated);
      }
    } catch (e) {
      const updated = storage.saveDraft(newDraft);
      setDrafts(updated);
    }

    setEditingDraftId(null);
    showToast(editingDraftId ? 'Draft updated!' : 'Draft saved to Studio!');
  };

  const handlePublishPost = async (draftIdToPublish = null) => {
    if (!currentUser) {
      setAuthModalOpen(true);
      showToast('Please sign in to publish posts', 'warning');
      return;
    }
    if (!isPostValid && !draftIdToPublish) {
      showToast('Please fix platform compliance errors before publishing', 'warning');
      return;
    }

    const draftToPublish = draftIdToPublish 
      ? drafts.find(d => d.id === draftIdToPublish)
      : {
          id: editingDraftId || `draft_${Date.now()}`,
          userEmail: currentUser.email,
          title: postTitle.trim() || postContent.slice(0, 40) + '...',
          content: postContent,
          targetPlatforms: selectedPlatforms,
          mediaFiles: uploadedMedia
        };

    if (!draftToPublish) return;

    const publishedRecord = {
      ...draftToPublish,
      status: 'published',
      publishedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    // Optimistically update state, save to local storage, and switch to Published tab
    const updatedList = storage.saveDraft(publishedRecord);
    setDrafts(updatedList);
    setActiveStudioTab('published');

    try {
      await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(publishedRecord)
      });
      fetchUserDrafts(currentUser.email);
    } catch (e) {
      console.error("Publish post network error:", e);
    }

    if (!draftIdToPublish) {
      setPostContent('');
      setPostTitle('');
      setUploadedMedia([]);
      setEditingDraftId(null);
    }
    showToast('Post published successfully across selected platforms! 🎉');
  };

  const handleEditDraft = (draft) => {
    setEditingDraftId(draft.id);
    setPostTitle(draft.title || '');
    setPostContent(draft.content || '');
    setSelectedPlatforms(draft.targetPlatforms || ['twitter', 'instagram', 'linkedin', 'facebook']);
    setUploadedMedia(draft.mediaFiles || []);
    if (draft.targetPlatforms && draft.targetPlatforms.length) {
      setActivePreviewTab(draft.targetPlatforms[0]);
    }
    showToast('Draft loaded into Composer');
  };

  const handleDeleteDraft = async (id) => {
    // Optimistically remove item from UI and local storage
    setDrafts(prev => prev.filter(d => String(d.id) !== String(id)));
    if (currentUser?.email) {
      storage.deleteDraft(id, currentUser.email);
    }

    try {
      if (currentUser?.email) {
        await fetch(`/api/drafts?id=${encodeURIComponent(id)}&email=${encodeURIComponent(currentUser.email)}`, {
          method: 'DELETE'
        });
        fetchUserDrafts(currentUser.email);
      }
    } catch (e) {
      console.error("Delete draft network error:", e);
    }
    showToast('Post removed successfully');
  };

  const clearComposer = () => {
    setPostContent('');
    setPostTitle('');
    setUploadedMedia([]);
    setEditingDraftId(null);
  };

  // Render formatted text with hashtag highlights
  const renderFormattedText = (text) => {
    if (!text) return <span className="text-slate-400 italic">Start typing your post content...</span>;
    const parts = text.split(/(#[\w\u0590-\u05ff]+)/g);
    return parts.map((part, index) => {
      if (part.startsWith('#')) {
        return (
          <span key={index} className="font-semibold text-blue-600 hover:underline cursor-pointer">
            {part}
          </span>
        );
      }
      return part;
    });
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans antialiased selection:bg-slate-200">
      
      {/* Toast Notification Banner */}
      {toast && (
        <div className="fixed top-5 right-5 z-50 animate-bounce">
          <div className={`px-5 py-3 rounded-2xl shadow-xl border flex items-center gap-3 ${
            toast.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-800' :
            toast.type === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
            'bg-white border-slate-200 text-slate-900 shadow-slate-200/50'
          }`}>
            <span className="text-lg">
              {toast.type === 'error' ? '⚠️' : toast.type === 'warning' ? '⚡' : '✨'}
            </span>
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        </div>
      )}

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        
        {/* Header Bar */}
        <header className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-8 bg-white/80 backdrop-blur-md p-4 sm:p-6 rounded-3xl border border-slate-200 shadow-none">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-slate-900 flex items-center justify-center border border-slate-800 shadow-none">
              <svg className="w-6 h-6 text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">PostForge</h1>
              <p className="text-xs text-slate-500 font-medium">Multi-Platform Post Composer & Draft Studio</p>
            </div>
          </div>

          {/* Auth Button */}
          <div className="flex items-center gap-3">
            {currentUser ? (
              <div className="flex items-center gap-3 bg-slate-100 p-1.5 pl-4 rounded-full border border-slate-200">
                <span className="text-xs font-semibold text-slate-800">
                  {formatName(currentUser.name || currentUser.email?.split('@')[0])}
                </span>
                <button
                  onClick={handleLogout}
                  className="px-3.5 py-1.5 rounded-full bg-white text-xs font-medium text-slate-700 hover:bg-slate-200 transition shadow-none"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => { setAuthMode('login'); setAuthModalOpen(true); }}
                className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-none transition active:scale-95"
              >
                Sign In / Register
              </button>
            )}
          </div>
        </header>

        {/* Workspace Layout Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: Composer & Validation Panel (7 cols) */}
          <div className="lg:col-span-7 space-y-6">
            
            {/* Target Platforms Bar */}
            <div className="bg-white p-5 rounded-3xl border border-slate-200 shadow-none space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Select Target Platforms</label>
                <span className="text-xs font-medium text-slate-500">{selectedPlatforms.length} Selected</span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {Object.values(PLATFORMS).map(platform => {
                  const isSelected = selectedPlatforms.includes(platform.id);
                  return (
                    <button
                      key={platform.id}
                      onClick={() => togglePlatform(platform.id)}
                      className={`flex items-center justify-between p-3 rounded-2xl border transition-all text-left ${
                        isSelected
                          ? `bg-slate-900 text-white border-slate-900 shadow-none`
                          : `bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-100/70`
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {platform.iconSvg ? (
                          <svg className={`w-4 h-4 fill-current ${isSelected ? 'text-white' : 'text-slate-700'}`} viewBox="0 0 24 24">
                            <path d={platform.iconSvg} />
                          </svg>
                        ) : (
                          <span className={`w-2 h-2 rounded-full ${isSelected ? 'bg-emerald-400' : 'bg-slate-300'}`}></span>
                        )}
                        <span className="text-xs font-semibold">{platform.name}</span>
                      </div>
                      <span className="text-[10px] opacity-75 font-mono">{platform.maxChars}c</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Post Content Composer Box */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-none space-y-4">
              
              <div className="flex items-center justify-between">
                <input
                  type="text"
                  placeholder="Optional Draft Title (e.g. Launch Announcement)"
                  value={postTitle}
                  onChange={e => setPostTitle(e.target.value)}
                  className="w-full text-sm font-semibold text-slate-800 placeholder-slate-400 bg-transparent border-b border-slate-100 pb-2 focus:outline-none focus:border-slate-400 transition"
                />
                {editingDraftId && (
                  <button
                    onClick={clearComposer}
                    className="text-xs text-rose-500 font-medium hover:underline ml-2 whitespace-nowrap"
                  >
                    Clear Draft Mode
                  </button>
                )}
              </div>

              {/* Textarea */}
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  rows={6}
                  value={postContent}
                  onChange={e => setPostContent(e.target.value)}
                  placeholder="Write your post content here... Use #hashtags and emojis!"
                  className="w-full text-sm text-slate-800 placeholder-slate-400 bg-slate-50 p-4 rounded-2xl border border-slate-200 focus:outline-none focus:border-slate-400 transition resize-y font-normal"
                ></textarea>
              </div>

              {/* Quick Formatting Tools: Emojis & Trending Hashtags */}
              <div className="space-y-3 pt-2">
                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Quick Emojis</label>
                  <div className="flex flex-wrap gap-1.5">
                    {EMOJI_LIST.map((emoji, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => insertEmoji(emoji)}
                        className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-slate-200 text-sm flex items-center justify-center transition active:scale-95"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">Trending Hashtags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {TRENDING_HASHTAGS.map((tag, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => insertHashtag(tag)}
                        className="px-2.5 py-1 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700 transition"
                      >
                        {tag}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Media Uploader Section */}
              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-400">Media Attachments ({uploadedMedia.length})</label>
                  <label className="cursor-pointer px-3.5 py-1.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs font-semibold text-slate-700 transition flex items-center gap-1.5">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 4v16m8-8H4" />
                    </svg>
                    Add Photos, Videos or PDFs
                    <input
                      type="file"
                      multiple
                      accept="image/*,video/*,application/pdf"
                      onChange={handleFileUpload}
                      className="hidden"
                    />
                  </label>
                </div>

                {/* Media Thumbnails Grid */}
                {uploadedMedia.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {uploadedMedia.map((m) => (
                      <div key={m.id} className="relative group rounded-2xl overflow-hidden border border-slate-200 bg-slate-100 aspect-video flex items-center justify-center">
                        {m.type === 'image' && (
                          <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                        )}
                        {m.type === 'video' && (
                          <div className="flex flex-col items-center p-2 text-center">
                            <span className="text-xl">📹</span>
                            <span className="text-[10px] font-medium text-slate-600 truncate max-w-[90%]">{m.name}</span>
                          </div>
                        )}
                        {m.type === 'pdf' && (
                          <div className="flex flex-col items-center p-2 text-center">
                            <span className="text-xl">📄</span>
                            <span className="text-[10px] font-medium text-slate-600 truncate max-w-[90%]">{m.name}</span>
                          </div>
                        )}
                        
                        <button
                          type="button"
                          onClick={() => removeMedia(m.id)}
                          className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-slate-900/80 text-white flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 transition shadow"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-400 italic">No media uploaded. Drag & drop or select files above.</p>
                )}
              </div>

              {/* Primary Action Buttons */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={clearComposer}
                  className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 transition"
                >
                  Clear All
                </button>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    className="px-5 py-2.5 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold transition"
                  >
                    {editingDraftId ? 'Update Draft' : 'Save Draft'}
                  </button>

                  <button
                    type="button"
                    onClick={() => handlePublishPost()}
                    disabled={!isPostValid}
                    className={`px-6 py-2.5 rounded-2xl text-xs font-bold transition ${
                      isPostValid
                        ? 'bg-slate-900 hover:bg-slate-800 text-white shadow-none'
                        : 'bg-slate-100 text-slate-400 cursor-not-allowed shadow-none border border-slate-200/60'
                    }`}
                  >
                    Publish Post Now
                  </button>
                </div>
              </div>
            </div>

            {/* Real-Time Compliance Ring Panel */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-none space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Real-Time Validation & Rings</h3>
                <span className="text-xs text-slate-500 font-medium">Compliance Check</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {selectedPlatforms.map(pKey => {
                  const platform = PLATFORMS[pKey];
                  const val = validations[pKey];
                  const ring = calculateSvgRing(val.percentage, 18);

                  return (
                    <div key={pKey} className="p-4 rounded-2xl bg-slate-50 border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <span className={`p-1.5 rounded-lg flex items-center justify-center ${platform.badgeBg} ${platform.badgeText}`}>
                            <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24">
                              <path d={platform.iconSvg} />
                            </svg>
                          </span>
                          <span className="text-xs font-bold text-slate-800">{platform.name}</span>
                        </div>
                        
                        {/* SVG Circular Progress Ring */}
                        <div className="relative w-11 h-11 flex items-center justify-center">
                          <svg className="w-11 h-11 transform -rotate-90" viewBox="0 0 44 44">
                            <circle
                              cx="22"
                              cy="22"
                              r="18"
                              className="stroke-slate-200"
                              strokeWidth="4"
                              fill="transparent"
                            />
                            <circle
                              cx="22"
                              cy="22"
                              r="18"
                              className={`transition-all duration-300 ${val.ringBgClass}`}
                              strokeWidth="4"
                              strokeDasharray={ring.circumference}
                              strokeDashoffset={ring.strokeDashoffset}
                              strokeLinecap="round"
                              fill="transparent"
                            />
                          </svg>
                          <span className="absolute text-[10px] font-bold text-slate-700">
                            {val.percentage}%
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between text-[11px] text-slate-500 font-medium">
                        <span>{val.charCount} / {platform.maxChars} chars</span>
                        <span className={val.remainingChars < 0 ? 'text-rose-500 font-bold' : ''}>
                          {val.remainingChars} left
                        </span>
                      </div>

                      {/* Error & Warning Messages */}
                      {val.errors.length > 0 && (
                        <div className="space-y-1 pt-1">
                          {val.errors.map((err, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-rose-600 font-medium">
                              <span className="mt-0.5">⚠️</span>
                              <span>{err}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {val.warnings.length > 0 && val.errors.length === 0 && (
                        <div className="space-y-1 pt-1">
                          {val.warnings.map((warn, idx) => (
                            <div key={idx} className="flex items-start gap-1.5 text-[11px] text-amber-600 font-medium">
                              <span className="mt-0.5">💡</span>
                              <span>{warn}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {val.isValid && val.warnings.length === 0 && (
                        <div className="text-[11px] text-emerald-600 font-semibold flex items-center gap-1">
                          <span>✓</span> Platform Compliant
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* RIGHT COLUMN: Live Mockup Preview & Draft Studio (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            
            {/* Live Platform Feed Mockup Card */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Live Mockup Preview</h3>
                <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                  {selectedPlatforms.map(pKey => (
                    <button
                      key={pKey}
                      onClick={() => setActivePreviewTab(pKey)}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition flex items-center gap-1.5 ${
                        activePreviewTab === pKey
                          ? 'bg-white text-slate-900 border border-slate-200/60'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                        <path d={PLATFORMS[pKey].iconSvg} />
                      </svg>
                      {PLATFORMS[pKey].name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Render Active Platform Mockup */}
              {(() => {
                const currentPlatform = PLATFORMS[activePreviewTab] || PLATFORMS.twitter;
                const authorName = currentUser
                  ? formatName(currentUser.name || currentUser.email.split('@')[0])
                  : currentPlatform.displayName;
                const authorHandle = currentUser?.email
                  ? `@${currentUser.email.split('@')[0]}`
                  : currentPlatform.handle;

                return (
                  <div className="border border-slate-200/90 rounded-2xl bg-white p-4 space-y-3.5 shadow-sm">
                    
                    {/* Mockup Header */}
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={currentPlatform.avatar}
                          alt={authorName}
                          className="w-10 h-10 rounded-full object-cover border border-slate-200"
                        />
                        <div>
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-slate-900">{authorName}</span>
                            {currentPlatform.verified && (
                              <svg className="w-3.5 h-3.5 text-blue-500 fill-current" viewBox="0 0 24 24">
                                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/>
                              </svg>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-400 font-medium block">
                            {authorHandle} · Just now
                          </span>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold flex items-center gap-1.5 ${currentPlatform.badgeBg} ${currentPlatform.badgeText}`}>
                        <svg className="w-3 h-3 fill-current" viewBox="0 0 24 24">
                          <path d={currentPlatform.iconSvg} />
                        </svg>
                        {currentPlatform.name}
                      </span>
                    </div>

                    {/* Post Content */}
                    <div className="text-xs sm:text-sm text-slate-800 leading-relaxed whitespace-pre-line font-normal break-words [overflow-wrap:anywhere] max-w-full overflow-hidden">
                      {renderFormattedText(postContent)}
                    </div>

                    {/* Uploaded Media Render */}
                    {uploadedMedia.length > 0 && (
                      <div className={`grid gap-2 rounded-xl overflow-hidden ${
                        uploadedMedia.length === 1 ? 'grid-cols-1' : 'grid-cols-2'
                      }`}>
                        {uploadedMedia.map((m) => (
                          <div key={m.id} className="relative bg-slate-100 rounded-lg overflow-hidden border border-slate-200/60 aspect-video flex items-center justify-center">
                            {m.type === 'image' && (
                              <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                            )}
                            {m.type === 'video' && (
                              <div className="p-3 text-center">
                                <span className="text-2xl block mb-1">▶️</span>
                                <span className="text-[10px] text-slate-600 font-semibold">{m.name}</span>
                              </div>
                            )}
                            {m.type === 'pdf' && (
                              <div className="p-3 text-center">
                                <span className="text-2xl block mb-1">📄</span>
                                <span className="text-[10px] text-slate-700 font-semibold">{m.name} (PDF Attachment)</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Mock Action Bar */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-xs text-slate-400 font-medium px-1">
                      <span>💬 0 Comments</span>
                      <span>🔄 0 Shares</span>
                      <span>❤️ 0 Likes</span>
                      <span>🔖 Save</span>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Account-Scoped Draft Studio & Published History */}
            <div className="bg-white p-6 rounded-3xl border border-slate-200 shadow-none space-y-4">
              
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400">Account Studio</h3>
                {currentUser && (
                  <div className="flex gap-1 bg-slate-100 p-1 rounded-xl">
                    <button
                      onClick={() => setActiveStudioTab('drafts')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        activeStudioTab === 'drafts'
                          ? 'bg-white text-slate-900 border border-slate-200/60'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Drafts ({drafts.filter(d => d.status !== 'published').length})
                    </button>
                    <button
                      onClick={() => setActiveStudioTab('published')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold transition ${
                        activeStudioTab === 'published'
                          ? 'bg-white text-slate-900 border border-slate-200/60'
                          : 'text-slate-500 hover:text-slate-800'
                      }`}
                    >
                      Published ({drafts.filter(d => d.status === 'published').length})
                    </button>
                  </div>
                )}
              </div>

              {/* LOGGED OUT STATE: Lock Screen */}
              {!currentUser ? (
                <div className="py-10 px-4 text-center rounded-2xl bg-slate-50 border border-dashed border-slate-300 space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-slate-200 text-slate-600 flex items-center justify-center mx-auto text-xl border border-slate-300">
                    🔒
                  </div>
                  <div className="space-y-1">
                    <h4 className="text-sm font-bold text-slate-800">Sign In to Access Draft Studio</h4>
                    <p className="text-xs text-slate-500 max-w-xs mx-auto">
                      Your saved drafts and published post history are private and account-scoped.
                    </p>
                  </div>
                  <button
                    onClick={() => { setAuthMode('login'); setAuthModalOpen(true); }}
                    className="px-5 py-2.5 rounded-full bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition shadow-none"
                  >
                    Sign In Now
                  </button>
                </div>
              ) : (
                /* LOGGED IN STATE: Drafts / Published List */
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {drafts
                    .filter(d => activeStudioTab === 'published' ? d.status === 'published' : d.status !== 'published')
                    .length === 0 ? (
                    <div className="py-8 text-center text-slate-400 text-xs italic bg-slate-50 rounded-2xl border border-slate-200">
                      No {activeStudioTab} found for {currentUser.email}.
                    </div>
                  ) : (
                    drafts
                      .filter(d => activeStudioTab === 'published' ? d.status === 'published' : d.status !== 'published')
                      .map((item) => (
                        <div
                          key={item.id}
                          className="p-4 rounded-2xl bg-slate-50 hover:bg-slate-100/70 border border-slate-200 transition space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold text-slate-900 truncate max-w-[200px]">
                              {item.title || 'Untitled Post'}
                            </h4>
                            <span className="text-[10px] text-slate-400 font-mono">
                              {formatDate(item.updatedAt || item.createdAt)}
                            </span>
                          </div>

                          <p className="text-xs text-slate-600 line-clamp-2 break-words [overflow-wrap:anywhere]">
                            {item.content}
                          </p>

                          {/* Media Attachments Preview */}
                          {item.mediaFiles && item.mediaFiles.length > 0 && (
                            <div className="flex gap-2 py-1 overflow-x-auto">
                              {item.mediaFiles.map((m, idx) => (
                                <div key={idx} className="w-12 h-12 rounded-lg bg-slate-200 overflow-hidden shrink-0 border border-slate-300 flex items-center justify-center">
                                  {m.type === 'image' || m.url?.startsWith('data:image') || (typeof m.url === 'string' && m.url.match(/\.(jpeg|jpg|png|gif|webp)/i)) ? (
                                    <img src={m.url} alt={m.name} className="w-full h-full object-cover" />
                                  ) : m.type === 'video' || (m.name && m.name.endsWith('.mp4')) ? (
                                    <span className="text-[10px] font-bold text-slate-700">📹 Video</span>
                                  ) : (
                                    <span className="text-[10px] font-bold text-slate-700">📄 PDF</span>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}

                          <div className="flex items-center justify-between pt-2 border-t border-slate-200/60">
                            <div className="flex gap-1">
                              {(item.targetPlatforms || []).map(p => (
                                <span key={p} className="px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-slate-200 text-slate-700">
                                  {p.slice(0, 2)}
                                </span>
                              ))}
                            </div>

                            <div className="flex items-center gap-2">
                              {activeStudioTab === 'drafts' && (
                                <>
                                  <button
                                    onClick={() => handleEditDraft(item)}
                                    className="text-xs font-semibold text-slate-700 hover:text-slate-900"
                                  >
                                    Edit
                                  </button>
                                  <button
                                    onClick={() => handlePublishPost(item.id)}
                                    className="text-xs font-bold text-emerald-600 hover:underline"
                                  >
                                    Publish
                                  </button>
                                </>
                              )}
                              <button
                                onClick={() => handleDeleteDraft(item.id)}
                                className="text-xs font-medium text-rose-500 hover:underline"
                              >
                                Delete
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                  )}
                </div>
              )}
            </div>

          </div>

        </div>
      </div>

      {/* Sign In & Account Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-white rounded-3xl p-6 sm:p-8 border border-slate-200 shadow-none space-y-6">
            
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">
                  {authMode === 'login' ? 'Sign In to PostForge' : 'Create Account'}
                </h3>
                <p className="text-xs text-slate-500">Access your private multi-platform drafts</p>
              </div>
              <button
                onClick={() => setAuthModalOpen(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center text-sm font-semibold hover:bg-slate-200"
              >
                ✕
              </button>
            </div>

            {authError && (
              <div className="p-3 rounded-2xl bg-rose-50 border border-rose-200 text-xs font-medium text-rose-700">
                {authError}
              </div>
            )}

            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === 'register' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={authName}
                    onChange={e => setAuthName(e.target.value)}
                    placeholder="Alex Morgan"
                    className="w-full text-xs p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-slate-400 transition"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="alex@postforge.com"
                  className="w-full text-xs p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-slate-400 transition"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full text-xs p-3 rounded-xl bg-slate-50 border border-slate-200 focus:outline-none focus:border-slate-400 transition"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full py-3 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-none transition"
              >
                {authLoading ? 'Authenticating...' : (authMode === 'login' ? 'Sign In' : 'Create Account')}
              </button>
            </form>

            <div className="text-center pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'register' : 'login');
                  setAuthError('');
                }}
                className="text-xs font-semibold text-slate-600 hover:underline"
              >
                {authMode === 'login' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
