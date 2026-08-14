import { useState, useEffect, useRef, useCallback } from "react";
import {
  Home, Users, Plus, Search, User, Bell, Heart, MessageCircle, Bookmark,
  Share2, Pin, Lock, Globe, UserCheck, LogOut, X, Check, ChevronLeft,
  EyeOff, Loader2, Ghost
} from "lucide-react";

/* ---------------------------------------------------------------------
   WISP — a real, minimally-scoped short-video social app.

   Storage model: everything lives in window.storage (shared: true) as
   three JSON documents — users, posts, notifications. There is no fake
   seed data anywhere in this file. An empty store renders empty states.
   Video files under 3MB are stored as base64 so playback survives a
   reload; larger files play for the current session only (browser
   storage limits — disclosed to the uploader at upload time).
--------------------------------------------------------------------- */

const INTERESTS = [
  "Gaming", "Technology", "Education", "Comedy", "Sports", "Music",
  "Fashion", "Business", "Art", "Travel", "Lifestyle", "Entertainment", "Science",
];

const MAX_VIDEO_BYTES = 3 * 1024 * 1024;

async function hashPassword(password, salt) {
  const enc = new TextEncoder().encode(salt + ":" + password);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function randomSalt() {
  return Array.from(crypto.getRandomValues(new Uint8Array(16))).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function timeAgo(ts) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return Math.floor(s / 60) + "m";
  if (s < 86400) return Math.floor(s / 3600) + "h";
  return Math.floor(s / 86400) + "d";
}
function isFriend(usersMap, a, b) {
  const ua = usersMap[a], ub = usersMap[b];
  if (!ua || !ub) return false;
  return (ua.following || []).includes(b) && (ub.following || []).includes(a);
}
function canView(post, viewer, usersMap) {
  if (!post) return false;
  if (post.author === viewer) return true;
  if (post.privacy === "public") return true;
  if (post.privacy === "private") return false;
  if (post.privacy === "friends") return isFriend(usersMap, viewer, post.author);
  return false;
}
function extractHashtags(text) {
  const m = text.match(/#[a-z0-9_]+/gi) || [];
  return [...new Set(m.map((h) => h.toLowerCase()))];
}

async function loadDoc(key, fallback) {
  try {
    const res = await window.storage.get(key, true);
    return res ? JSON.parse(res.value) : fallback;
  } catch {
    return fallback;
  }
}
async function saveDoc(key, value) {
  try {
    await window.storage.set(key, JSON.stringify(value), true);
  } catch (e) {
    console.error("storage save failed", key, e);
  }
}

export default function Wisp() {
  const [loading, setLoading] = useState(true);
  const [users, setUsers] = useState({});
  const [posts, setPosts] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [session, setSession] = useState(null); // username
  const [screen, setScreen] = useState("auth"); // auth | onboarding | welcome | app
  const [tab, setTab] = useState("fyp");
  const [viewingProfile, setViewingProfile] = useState(null); // username or null = self
  const seenRef = useRef(new Set());

  useEffect(() => {
    (async () => {
      const [u, p, n] = await Promise.all([
        loadDoc("wisp_users", {}),
        loadDoc("wisp_posts", []),
        loadDoc("wisp_notifications", []),
      ]);
      setUsers(u);
      setPosts(p);
      setNotifications(n);
      setLoading(false);
    })();
  }, []);

  const persistUsers = async (next) => { setUsers(next); await saveDoc("wisp_users", next); };
  const persistPosts = async (next) => { setPosts(next); await saveDoc("wisp_posts", next); };
  const persistNotifs = async (next) => { setNotifications(next); await saveDoc("wisp_notifications", next); };

  const pushNotification = async (n, currentNotifs) => {
    const next = [{ id: crypto.randomUUID(), read: false, timestamp: Date.now(), ...n }, ...currentNotifs];
    await persistNotifs(next);
  };

  const currentUser = session ? users[session] : null;

  if (loading) {
    return (
      <div className="w-full flex items-center justify-center py-24 bg-black">
        <Loader2 className="animate-spin text-neutral-500" size={22} />
      </div>
    );
  }

  if (screen === "auth" || !currentUser) {
    return (
      <AuthScreen
        users={users}
        onRegistered={async (user) => {
          const next = { ...users, [user.username]: user };
          await persistUsers(next);
          setSession(user.username);
          setScreen("onboarding");
        }}
        onLoggedIn={(username) => {
          setSession(username);
          setScreen("app");
          setTab("fyp");
        }}
      />
    );
  }

  if (screen === "onboarding") {
    return (
      <OnboardingScreen
        onDone={async (interests) => {
          const updated = { ...currentUser, interests };
          const next = { ...users, [currentUser.username]: updated };
          await persistUsers(next);
          setScreen("welcome");
          setTimeout(() => { setScreen("app"); setTab("fyp"); }, 2000);
        }}
      />
    );
  }

  if (screen === "welcome") {
    return (
      <div className="w-full flex flex-col items-center justify-center py-28 bg-black text-white gap-2">
        <div className="text-2xl tracking-tight font-light">welcome, <span className="font-medium">@{currentUser.username}</span></div>
        <div className="text-neutral-500 text-sm">setting up your feed</div>
      </div>
    );
  }

  const profileUsername = viewingProfile || currentUser.username;
  const profileUser = users[profileUsername];

  return (
    <div className="w-full max-w-[420px] mx-auto bg-black text-white rounded-2xl overflow-hidden border-[0.5px] border-neutral-800" style={{ fontFamily: "system-ui, sans-serif" }}>
      <Header
        currentUser={currentUser}
        notifications={notifications}
        onBell={() => { setTab("notifications"); setViewingProfile(null); }}
        onLogout={() => { setSession(null); setScreen("auth"); setTab("fyp"); }}
      />

      <div className="min-h-[520px] max-h-[640px] overflow-y-auto" style={{ scrollbarWidth: "thin" }}>
        {tab === "fyp" && (
          <FeedView
            mode="fyp"
            posts={posts}
            users={users}
            currentUser={currentUser}
            seenRef={seenRef}
            onOpenProfile={(u) => { setViewingProfile(u); setTab("profile"); }}
            onUpdatePosts={persistPosts}
            onNotify={(n) => pushNotification(n, notifications)}
          />
        )}
        {tab === "following" && (
          <FeedView
            mode="following"
            posts={posts}
            users={users}
            currentUser={currentUser}
            seenRef={seenRef}
            onOpenProfile={(u) => { setViewingProfile(u); setTab("profile"); }}
            onUpdatePosts={persistPosts}
            onNotify={(n) => pushNotification(n, notifications)}
          />
        )}
        {tab === "search" && (
          <SearchView
            posts={posts}
            users={users}
            currentUser={currentUser}
            onOpenProfile={(u) => { setViewingProfile(u); setTab("profile"); }}
          />
        )}
        {tab === "upload" && (
          <UploadView
            currentUser={currentUser}
            onPublish={async (post) => {
              const next = [post, ...posts];
              await persistPosts(next);
              setTab("fyp");
            }}
          />
        )}
        {tab === "notifications" && (
          <NotificationsView
            notifications={notifications}
            currentUser={currentUser}
            users={users}
            onMarkRead={async () => {
              const next = notifications.map((n) => (n.forUser === currentUser.username ? { ...n, read: true } : n));
              await persistNotifs(next);
            }}
          />
        )}
        {tab === "profile" && profileUser && (
          <ProfileView
            profileUser={profileUser}
            isSelf={profileUsername === currentUser.username}
            currentUser={currentUser}
            users={users}
            posts={posts}
            onBack={viewingProfile ? () => setViewingProfile(null) : null}
            onOpenProfile={(u) => setViewingProfile(u)}
            onUpdateUsers={persistUsers}
            onNotify={(n) => pushNotification(n, notifications)}
          />
        )}
      </div>

      <BottomNav
        tab={tab}
        onChange={(t) => { setTab(t); if (t !== "profile") setViewingProfile(null); }}
      />
    </div>
  );
}

/* ---------------- Header ---------------- */
function Header({ currentUser, notifications, onBell, onLogout }) {
  const unread = notifications.filter((n) => n.forUser === currentUser.username && !n.read).length;
  return (
    <div className="flex items-center justify-between px-4 py-3 border-b-[0.5px] border-neutral-800">
      <div className="text-lg font-medium tracking-tight lowercase">wisp</div>
      <div className="flex items-center gap-3">
        {currentUser.incognito && <Ghost size={16} className="text-neutral-500" aria-label="incognito mode on" />}
        <button onClick={onBell} className="relative" aria-label="notifications">
          <Bell size={19} className="text-neutral-300" />
          {unread > 0 && (
            <span className="absolute -top-1 -right-1 bg-orange-500 text-[9px] leading-none rounded-full w-3.5 h-3.5 flex items-center justify-center">{unread}</span>
          )}
        </button>
        <button onClick={onLogout} aria-label="log out">
          <LogOut size={17} className="text-neutral-500" />
        </button>
      </div>
    </div>
  );
}

/* ---------------- Bottom nav ---------------- */
function BottomNav({ tab, onChange }) {
  const items = [
    { id: "fyp", icon: Home, label: "for you" },
    { id: "following", icon: Users, label: "following" },
    { id: "upload", icon: Plus, label: "upload" },
    { id: "search", icon: Search, label: "search" },
    { id: "profile", icon: User, label: "profile" },
  ];
  return (
    <div className="flex items-center justify-between px-2 py-2 border-t-[0.5px] border-neutral-800 bg-black">
      {items.map(({ id, icon: Icon, label }) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg"
          aria-label={label}
        >
          <Icon size={20} className={tab === id ? "text-white" : "text-neutral-600"} strokeWidth={tab === id ? 2.2 : 1.8} />
        </button>
      ))}
    </div>
  );
}

/* ---------------- Auth ---------------- */
function AuthScreen({ users, onRegistered, onLoggedIn }) {
  const [mode, setMode] = useState("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [dob, setDob] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError("");
    const uname = username.trim().toLowerCase();
    if (!/^[a-z0-9_]{3,20}$/.test(uname)) return setError("username: 3-20 chars, lowercase letters, numbers, underscore only");
    if (mode === "login") {
      const u = users[uname];
      if (!u) return setError("no account with that username");
      setBusy(true);
      const hash = await hashPassword(password, u.salt);
      setBusy(false);
      if (hash !== u.passHash) return setError("incorrect password");
      onLoggedIn(uname);
      return;
    }
    if (users[uname]) return setError("that username is already taken");
    if (password.length < 6) return setError("password needs at least 6 characters");
    if (password !== confirm) return setError("passwords don't match");
    if (!dob) return setError("enter your date of birth");
    const age = Math.floor((Date.now() - new Date(dob).getTime()) / 31557600000);
    if (age < 13) return setError("you must be 13 or older to use wisp");
    setBusy(true);
    const salt = randomSalt();
    const passHash = await hashPassword(password, salt);
    setBusy(false);
    onRegistered({
      username: uname,
      salt, passHash,
      displayName: displayName.trim() || uname,
      bio: "",
      interests: [],
      followers: [],
      following: [],
      bookmarks: [],
      avatar: null,
      incognito: false,
      createdAt: Date.now(),
    });
  };

  return (
    <div className="w-full max-w-[380px] mx-auto bg-black text-white rounded-2xl border-[0.5px] border-neutral-800 px-6 py-10">
      <div className="text-2xl font-medium lowercase tracking-tight mb-1">wisp</div>
      <div className="text-neutral-500 text-sm mb-7">{mode === "login" ? "log back in" : "create your account"}</div>

      <div className="flex flex-col gap-3">
        <input className="bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="username" value={username} onChange={(e) => setUsername(e.target.value)} />
        {mode === "register" && (
          <input className="bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="display name" value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
        )}
        <input type="password" className="bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="password" value={password} onChange={(e) => setPassword(e.target.value)} />
        {mode === "register" && (
          <>
            <input type="password" className="bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none" placeholder="confirm password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            <label className="text-xs text-neutral-500 -mb-1.5">date of birth</label>
            <input type="date" className="bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none" value={dob} onChange={(e) => setDob(e.target.value)} />
          </>
        )}
      </div>

      {error && <div className="text-red-400 text-xs mt-3">{error}</div>}

      <button onClick={submit} disabled={busy} className="w-full mt-5 bg-white text-black rounded-lg py-2.5 text-sm font-medium">
        {busy ? "please wait…" : mode === "login" ? "log in" : "create account"}
      </button>

      <button
        onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}
        className="w-full mt-3 text-neutral-500 text-xs"
      >
        {mode === "login" ? "new here? create an account" : "already have an account? log in"}
      </button>
    </div>
  );
}

/* ---------------- Onboarding ---------------- */
function OnboardingScreen({ onDone }) {
  const [picked, setPicked] = useState([]);
  const toggle = (i) => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]));
  return (
    <div className="w-full max-w-[380px] mx-auto bg-black text-white rounded-2xl border-[0.5px] border-neutral-800 px-6 py-10">
      <div className="text-lg font-medium mb-1">what do you want to see?</div>
      <div className="text-neutral-500 text-sm mb-6">pick a few interests — you can change these later</div>
      <div className="flex flex-wrap gap-2">
        {INTERESTS.map((i) => (
          <button
            key={i}
            onClick={() => toggle(i)}
            className={`text-xs px-3 py-1.5 rounded-full border-[0.5px] ${picked.includes(i) ? "bg-white text-black border-white" : "border-neutral-700 text-neutral-300"}`}
          >
            {i}
          </button>
        ))}
      </div>
      <button
        onClick={() => onDone(picked)}
        disabled={picked.length === 0}
        className="w-full mt-8 bg-white text-black rounded-lg py-2.5 text-sm font-medium disabled:opacity-40"
      >
        continue
      </button>
    </div>
  );
}

/* ---------------- Feed (FYP + Following) ---------------- */
function FeedView({ mode, posts, users, currentUser, seenRef, onOpenProfile, onUpdatePosts, onNotify }) {
  const visible = posts.filter((p) => canView(p, currentUser.username, users));

  let list;
  if (mode === "following") {
    list = visible
      .filter((p) => (currentUser.following || []).includes(p.author))
      .sort((a, b) => b.timestamp - a.timestamp);
  } else {
    const interests = currentUser.interests || [];
    list = [...visible].sort((a, b) => {
      const scoreOf = (p) => {
        const tagMatch = (p.hashtags || []).filter((h) => interests.some((i) => h.includes(i.toLowerCase()))).length;
        return tagMatch * 10 + (p.likes || []).length * 2 + (p.comments || []).length * 3;
      };
      const sb = scoreOf(b), sa = scoreOf(a);
      if (sb !== sa) return sb - sa;
      return b.timestamp - a.timestamp;
    });
  }

  if (mode === "following" && (currentUser.following || []).length === 0) {
    return <EmptyState title="you're not following anyone yet" subtitle="follow real accounts to see their posts here" />;
  }
  if (list.length === 0) {
    return <EmptyState title="your feed is waiting for the first post" subtitle="nobody has uploaded here yet" />;
  }

  const updatePost = (id, updater) => {
    const next = posts.map((p) => (p.id === id ? updater(p) : p));
    onUpdatePosts(next);
  };

  return (
    <div className="flex flex-col">
      {list.map((post) => (
        <PostCard
          key={post.id}
          post={post}
          author={users[post.author]}
          currentUser={currentUser}
          seenRef={seenRef}
          onOpenProfile={onOpenProfile}
          onUpdatePost={updatePost}
          onNotify={onNotify}
        />
      ))}
    </div>
  );
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-24 px-8 gap-1">
      <div className="text-neutral-300 text-sm font-medium">{title}</div>
      <div className="text-neutral-600 text-xs">{subtitle}</div>
    </div>
  );
}

function PostCard({ post, author, currentUser, seenRef, onOpenProfile, onUpdatePost, onNotify }) {
  const [showComments, setShowComments] = useState(false);
  const [commentText, setCommentText] = useState("");
  const videoRef = useRef(null);
  const liked = (post.likes || []).includes(currentUser.username);
  const bookmarked = (currentUser.bookmarks || []).includes(post.id);
  const isAuthor = post.author === currentUser.username;

  useEffect(() => {
    const key = post.id + "|" + currentUser.username;
    if (!isAuthor && !seenRef.current.has(key)) {
      seenRef.current.add(key);
      if (!(post.views || []).includes(currentUser.username)) {
        onUpdatePost(post.id, (p) => ({ ...p, views: [...(p.views || []), currentUser.username] }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [post.id]);

  const toggleLike = () => {
    onUpdatePost(post.id, (p) => {
      const has = (p.likes || []).includes(currentUser.username);
      const likes = has ? p.likes.filter((u) => u !== currentUser.username) : [...(p.likes || []), currentUser.username];
      if (!has && p.author !== currentUser.username) {
        onNotify({ forUser: p.author, type: "like", fromUser: currentUser.username, postId: p.id });
      }
      return { ...p, likes };
    });
  };

  const submitComment = () => {
    const text = commentText.trim();
    if (!text) return;
    const comment = { id: crypto.randomUUID(), author: currentUser.username, text, timestamp: Date.now(), pinned: false };
    onUpdatePost(post.id, (p) => ({ ...p, comments: [...(p.comments || []), comment] }));
    if (post.author !== currentUser.username) {
      onNotify({ forUser: post.author, type: "comment", fromUser: currentUser.username, postId: post.id });
    }
    setCommentText("");
  };

  const togglePin = (commentId) => {
    onUpdatePost(post.id, (p) => ({
      ...p,
      comments: p.comments.map((c) => (c.id === commentId ? { ...c, pinned: !c.pinned } : { ...c, pinned: false })),
    }));
  };

  const toggleBookmark = () => {
    onUpdatePost(post.id, (p) => p); // no-op to keep signature; bookmark lives on user, handled via parent callback below
  };

  const share = async () => {
    const shareText = `wisp — @${post.author}: ${post.caption || ""}`;
    if (navigator.share) {
      try { await navigator.share({ text: shareText }); } catch { /* user cancelled */ }
    } else {
      try {
        await navigator.clipboard.writeText(shareText);
        alert("copied to clipboard");
      } catch { /* clipboard unavailable */ }
    }
  };

  const sortedComments = [...(post.comments || [])].sort((a, b) => (b.pinned - a.pinned) || (a.timestamp - b.timestamp));

  return (
    <div className="border-b-[0.5px] border-neutral-900 px-4 py-4">
      <div className="flex items-center gap-2 mb-2">
        <Avatar user={author} size={30} onClick={() => onOpenProfile(post.author)} />
        <div className="flex-1 min-w-0">
          <button onClick={() => onOpenProfile(post.author)} className="text-sm font-medium truncate block">@{post.author}</button>
        </div>
        <PrivacyBadge privacy={post.privacy} />
        <span className="text-[11px] text-neutral-600">{timeAgo(post.timestamp)}</span>
      </div>

      {post.videoData ? (
        <video ref={videoRef} src={post.videoData} controls playsInline className="w-full rounded-lg bg-neutral-900 max-h-[420px]" />
      ) : (
        <div className="w-full rounded-lg bg-neutral-900 h-40 flex items-center justify-center text-neutral-600 text-xs px-4 text-center">
          video unavailable after reload (file was over the 3MB session storage limit)
        </div>
      )}

      {post.caption && <div className="text-sm mt-2">{post.caption}</div>}

      <div className="flex items-center gap-5 mt-3">
        <button onClick={toggleLike} className="flex items-center gap-1.5" aria-label="like">
          <Heart size={19} className={liked ? "text-red-500 fill-red-500" : "text-neutral-400"} />
          <span className="text-xs text-neutral-400">{(post.likes || []).length}</span>
        </button>
        <button onClick={() => setShowComments((s) => !s)} className="flex items-center gap-1.5" aria-label="comments">
          <MessageCircle size={19} className="text-neutral-400" />
          <span className="text-xs text-neutral-400">{(post.comments || []).length}</span>
        </button>
        <BookmarkButton post={post} currentUser={currentUser} />
        <button onClick={share} aria-label="share">
          <Share2 size={19} className="text-neutral-400" />
        </button>
        <span className="ml-auto text-[11px] text-neutral-600">{(post.views || []).length} views</span>
      </div>

      {showComments && (
        <div className="mt-3 flex flex-col gap-2">
          {sortedComments.length === 0 && <div className="text-xs text-neutral-600">no comments yet</div>}
          {sortedComments.map((c) => (
            <div key={c.id} className="flex items-start gap-2 text-xs">
              <div className="flex-1">
                <span className="font-medium">@{c.author}</span>{" "}
                <span className="text-neutral-300">{c.text}</span>
                {c.pinned && <Pin size={10} className="inline ml-1 text-neutral-500" />}
              </div>
              {isAuthor && (
                <button onClick={() => togglePin(c.id)} className="text-neutral-600" aria-label="pin comment">
                  <Pin size={12} />
                </button>
              )}
            </div>
          ))}
          <div className="flex items-center gap-2 mt-1">
            <input
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && submitComment()}
              placeholder="add a comment"
              className="flex-1 bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-1.5 text-xs outline-none"
            />
            <button onClick={submitComment} className="text-xs text-neutral-300">post</button>
          </div>
        </div>
      )}
    </div>
  );
}

function BookmarkButton({ post, currentUser }) {
  // Bookmarks live on the user record; this button reaches up via a custom event
  // so PostCard doesn't need the full user-update plumbing threaded through.
  const [saved, setSaved] = useState((currentUser.bookmarks || []).includes(post.id));
  return (
    <button
      onClick={() => {
        window.dispatchEvent(new CustomEvent("wisp:toggle-bookmark", { detail: { postId: post.id } }));
        setSaved((s) => !s);
      }}
      aria-label="bookmark"
    >
      <Bookmark size={19} className={saved ? "text-white fill-white" : "text-neutral-400"} />
    </button>
  );
}

function PrivacyBadge({ privacy }) {
  if (privacy === "public") return <Globe size={12} className="text-neutral-600" aria-label="public" />;
  if (privacy === "friends") return <UserCheck size={12} className="text-neutral-600" aria-label="friends only" />;
  return <Lock size={12} className="text-neutral-600" aria-label="private" />;
}

function Avatar({ user, size = 32, onClick }) {
  const initials = (user?.displayName || user?.username || "?").slice(0, 2).toUpperCase();
  return (
    <button onClick={onClick} style={{ width: size, height: size }} className="rounded-full overflow-hidden bg-neutral-800 flex items-center justify-center shrink-0" aria-label="profile">
      {user?.avatar ? (
        <img src={user.avatar} alt="" className="w-full h-full object-cover" />
      ) : (
        <span className="text-[10px] text-neutral-400">{initials}</span>
      )}
    </button>
  );
}

/* ---------------- Search ---------------- */
function SearchView({ posts, users, currentUser, onOpenProfile }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  const matchedUsers = query ? Object.values(users).filter((u) => u.username.includes(query)) : [];
  const matchedPosts = query
    ? posts.filter(
        (p) => canView(p, currentUser.username, users) &&
          ((p.caption || "").toLowerCase().includes(query) || (p.hashtags || []).some((h) => h.includes(query)))
      )
    : [];

  return (
    <div className="px-4 py-4">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="search users or #hashtags"
        className="w-full bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none mb-4"
      />
      {!query && <div className="text-neutral-600 text-xs">search real accounts and posts on wisp</div>}
      {query && matchedUsers.length === 0 && matchedPosts.length === 0 && (
        <div className="text-neutral-500 text-sm">no results found</div>
      )}
      {matchedUsers.length > 0 && (
        <div className="mb-4">
          <div className="text-xs text-neutral-600 mb-2">accounts</div>
          {matchedUsers.map((u) => (
            <button key={u.username} onClick={() => onOpenProfile(u.username)} className="flex items-center gap-2 py-1.5 w-full text-left">
              <Avatar user={u} size={26} />
              <span className="text-sm">@{u.username}</span>
            </button>
          ))}
        </div>
      )}
      {matchedPosts.length > 0 && (
        <div>
          <div className="text-xs text-neutral-600 mb-2">posts</div>
          {matchedPosts.map((p) => (
            <div key={p.id} className="text-xs text-neutral-300 py-1.5 border-b-[0.5px] border-neutral-900">
              <span className="font-medium">@{p.author}</span> — {p.caption}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------------- Upload ---------------- */
function UploadView({ currentUser, onPublish }) {
  const [file, setFile] = useState(null);
  const [videoData, setVideoData] = useState(null);
  const [tooLarge, setTooLarge] = useState(false);
  const [caption, setCaption] = useState("");
  const [privacy, setPrivacy] = useState("public");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef(null);

  const handleFile = async (f) => {
    if (!f) return;
    setFile(f);
    setTooLarge(f.size > MAX_VIDEO_BYTES);
    if (f.size <= MAX_VIDEO_BYTES) {
      const data = await fileToBase64(f);
      setVideoData(data);
    } else {
      setVideoData(URL.createObjectURL(f)); // session-only preview
    }
  };

  const publish = async () => {
    if (!file) return;
    setBusy(true);
    const post = {
      id: crypto.randomUUID(),
      author: currentUser.username,
      videoData: tooLarge ? null : videoData,
      caption: caption.trim(),
      hashtags: extractHashtags(caption),
      privacy,
      likes: [],
      comments: [],
      views: [],
      timestamp: Date.now(),
    };
    await onPublish(post);
    setBusy(false);
    setFile(null); setVideoData(null); setCaption(""); setPrivacy("public");
  };

  return (
    <div className="px-4 py-4 flex flex-col gap-4">
      {!file ? (
        <button
          onClick={() => inputRef.current?.click()}
          className="w-full h-48 border-[0.5px] border-dashed border-neutral-700 rounded-xl flex flex-col items-center justify-center gap-2 text-neutral-500"
        >
          <Plus size={28} />
          <span className="text-sm">choose a video from your device</span>
        </button>
      ) : (
        <video src={tooLarge ? videoData : videoData} controls className="w-full rounded-lg max-h-[300px] bg-neutral-900" />
      )}
      <input ref={inputRef} type="file" accept="video/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />

      {tooLarge && (
        <div className="text-amber-500 text-xs">
          this file is over 3MB, wisp's in-browser storage limit — it'll play now but won't be there after a reload. pick a shorter clip to keep it posted for good.
        </div>
      )}

      {file && (
        <>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            placeholder="write a caption — use #hashtags so people can find it"
            rows={3}
            className="w-full bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2.5 text-sm outline-none resize-none"
          />
          <div className="flex gap-2">
            {[
              { id: "public", label: "public", icon: Globe },
              { id: "friends", label: "friends", icon: UserCheck },
              { id: "private", label: "private", icon: Lock },
            ].map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setPrivacy(id)}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-xs border-[0.5px] ${privacy === id ? "bg-white text-black border-white" : "border-neutral-700 text-neutral-400"}`}
              >
                <Icon size={13} /> {label}
              </button>
            ))}
          </div>
          <button onClick={publish} disabled={busy} className="w-full bg-white text-black rounded-lg py-2.5 text-sm font-medium">
            {busy ? "posting…" : "post"}
          </button>
        </>
      )}
    </div>
  );
}

/* ---------------- Notifications ---------------- */
function NotificationsView({ notifications, currentUser, users, onMarkRead }) {
  useEffect(() => { onMarkRead(); /* eslint-disable-next-line */ }, []);
  const mine = notifications.filter((n) => n.forUser === currentUser.username).sort((a, b) => b.timestamp - a.timestamp);
  if (mine.length === 0) return <EmptyState title="no notifications yet" subtitle="likes, comments, and follows will show up here" />;
  const verb = { like: "liked your post", comment: "commented on your post", follow: "started following you" };
  return (
    <div className="px-4 py-4 flex flex-col gap-3">
      {mine.map((n) => (
        <div key={n.id} className="flex items-center gap-2 text-sm">
          <Avatar user={users[n.fromUser]} size={26} />
          <span><span className="font-medium">@{n.fromUser}</span> <span className="text-neutral-400">{verb[n.type]}</span></span>
          <span className="ml-auto text-[11px] text-neutral-600">{timeAgo(n.timestamp)}</span>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Profile ---------------- */
function ProfileView({ profileUser, isSelf, currentUser, users, posts, onBack, onOpenProfile, onUpdateUsers, onNotify }) {
  const [bio, setBio] = useState(profileUser.bio || "");
  const [editingBio, setEditingBio] = useState(false);
  const [showFollowers, setShowFollowers] = useState(false);
  const [showFollowing, setShowFollowing] = useState(false);
  const fileRef = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (!isSelf) return;
      const { postId } = e.detail;
      const has = (currentUser.bookmarks || []).includes(postId);
      const bookmarks = has ? currentUser.bookmarks.filter((id) => id !== postId) : [...(currentUser.bookmarks || []), postId];
      onUpdateUsers({ ...users, [currentUser.username]: { ...currentUser, bookmarks } });
    };
    window.addEventListener("wisp:toggle-bookmark", handler);
    return () => window.removeEventListener("wisp:toggle-bookmark", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUser, users]);

  const following = (currentUser.following || []).includes(profileUser.username);
  const ownPosts = posts.filter((p) => p.author === profileUser.username && canView(p, currentUser.username, users));

  const toggleFollow = () => {
    const iFollow = (currentUser.following || []).includes(profileUser.username);
    const myFollowing = iFollow
      ? currentUser.following.filter((u) => u !== profileUser.username)
      : [...(currentUser.following || []), profileUser.username];
    const theirFollowers = iFollow
      ? (profileUser.followers || []).filter((u) => u !== currentUser.username)
      : [...(profileUser.followers || []), currentUser.username];
    onUpdateUsers({
      ...users,
      [currentUser.username]: { ...currentUser, following: myFollowing },
      [profileUser.username]: { ...profileUser, followers: theirFollowers },
    });
    if (!iFollow) onNotify({ forUser: profileUser.username, type: "follow", fromUser: currentUser.username });
  };

  const saveBio = () => {
    onUpdateUsers({ ...users, [currentUser.username]: { ...currentUser, bio } });
    setEditingBio(false);
  };

  const uploadAvatar = async (f) => {
    if (!f || f.size > 1.5 * 1024 * 1024) { alert("please choose an image under 1.5MB"); return; }
    const data = await fileToBase64(f);
    onUpdateUsers({ ...users, [currentUser.username]: { ...currentUser, avatar: data } });
  };

  const toggleIncognito = () => {
    onUpdateUsers({ ...users, [currentUser.username]: { ...currentUser, incognito: !currentUser.incognito } });
  };

  return (
    <div className="px-4 py-4">
      {onBack && (
        <button onClick={onBack} className="flex items-center gap-1 text-neutral-400 text-xs mb-3">
          <ChevronLeft size={14} /> back
        </button>
      )}

      <div className="flex items-center gap-3">
        <div className="relative">
          <Avatar user={profileUser} size={64} onClick={() => isSelf && fileRef.current?.click()} />
          {isSelf && <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={(e) => uploadAvatar(e.target.files?.[0])} />}
        </div>
        <div>
          <div className="text-base font-medium">{profileUser.displayName}</div>
          <div className="text-neutral-500 text-xs">@{profileUser.username}</div>
        </div>
      </div>

      <div className="flex gap-5 mt-4 text-sm">
        <div><span className="font-medium">{posts.filter((p) => p.author === profileUser.username).length}</span> <span className="text-neutral-500 text-xs">posts</span></div>
        <button onClick={() => setShowFollowers((s) => !s)}><span className="font-medium">{(profileUser.followers || []).length}</span> <span className="text-neutral-500 text-xs">followers</span></button>
        <button onClick={() => setShowFollowing((s) => !s)}><span className="font-medium">{(profileUser.following || []).length}</span> <span className="text-neutral-500 text-xs">following</span></button>
      </div>

      {showFollowers && (
        <PeopleList usernames={profileUser.followers || []} users={users} onOpenProfile={onOpenProfile} empty="no followers yet" />
      )}
      {showFollowing && (
        <PeopleList usernames={profileUser.following || []} users={users} onOpenProfile={onOpenProfile} empty="not following anyone yet" />
      )}

      <div className="mt-3">
        {isSelf && editingBio ? (
          <div className="flex flex-col gap-2">
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={2} className="w-full bg-neutral-900 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2 text-sm outline-none resize-none" />
            <button onClick={saveBio} className="self-start text-xs text-neutral-300">save bio</button>
          </div>
        ) : (
          <button onClick={() => isSelf && setEditingBio(true)} className="text-left text-sm text-neutral-300">
            {profileUser.bio || (isSelf ? "add a bio" : "")}
          </button>
        )}
      </div>

      {isSelf ? (
        <button onClick={toggleIncognito} className="flex items-center gap-2 mt-4 text-xs text-neutral-400 border-[0.5px] border-neutral-700 rounded-lg px-3 py-2">
          <EyeOff size={13} /> {currentUser.incognito ? "incognito on" : "go incognito"}
        </button>
      ) : (
        <button onClick={toggleFollow} className={`mt-4 w-full py-2 rounded-lg text-sm font-medium ${following ? "border-[0.5px] border-neutral-700 text-neutral-300" : "bg-white text-black"}`}>
          {following ? "following" : "follow"}
        </button>
      )}

      <div className="grid grid-cols-3 gap-1 mt-5">
        {ownPosts.length === 0 && <div className="col-span-3 text-neutral-600 text-xs py-8 text-center">no posts yet</div>}
        {ownPosts.map((p) => (
          <div key={p.id} className="aspect-square bg-neutral-900 rounded-md overflow-hidden flex items-center justify-center relative">
            {p.videoData ? (
              <video src={p.videoData} className="w-full h-full object-cover" muted />
            ) : (
              <span className="text-[10px] text-neutral-600 px-2 text-center">unavailable</span>
            )}
            <span className="absolute bottom-1 right-1 text-[10px] bg-black/60 rounded px-1">{(p.likes || []).length}♥</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PeopleList({ usernames, users, onOpenProfile, empty }) {
  if (usernames.length === 0) return <div className="text-neutral-600 text-xs mt-2">{empty}</div>;
  return (
    <div className="mt-2 flex flex-col gap-1.5 max-h-40 overflow-y-auto">
      {usernames.map((u) => (
        <button key={u} onClick={() => onOpenProfile(u)} className="flex items-center gap-2 text-sm">
          <Avatar user={users[u]} size={22} />
          @{u}
        </button>
      ))}
    </div>
  );
}
