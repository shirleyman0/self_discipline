// ===== 自律星球 前端逻辑（深空养成主题） =====
const TOKEN = localStorage.getItem('token');
if (!TOKEN) {
    location.href = '/login.html';
}

// 主题色（与 style.css 一致）
const C = {
    cyan: '#57e6d5', gold: '#ffd166', purple: '#a78bfa', coral: '#ff6b81',
    blue: '#60a5fa', dim: '#8b94c6', border: 'rgba(120,140,220,.25)', bg: '#1a2148'
};

/** fetch 封装：带 token；401 跳登录；非 2xx 抛错 */
async function api(path, options = {}) {
    const res = await fetch(path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + TOKEN,
            ...(options.headers || {})
        }
    });
    if (res.status === 401) {
        localStorage.removeItem('token');
        location.href = '/login.html';
        throw new Error('未登录');
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
        throw new Error((data && data.message) || '请求失败');
    }
    return data;
}

const VIEW_TITLES = {
    base: { icon: '🪐', name: '星球基地', sub: '你的星球正在因为你的自律而成长' },
    habits: { icon: '✅', name: '每日打卡', sub: '连续打卡，能量翻倍' },
    tasks: { icon: '📋', name: '任务清单', sub: '完成拿积分，拖延掉积分' },
    focus: { icon: '⏱️', name: '专注舱', sub: '进入心流，屏蔽整个宇宙' },
    shop: { icon: '🛍️', name: '奖励商店', sub: '攒的积分，痛快花掉' },
    partner: { icon: '👥', name: '共航搭档', sub: '互相监督，每周 PK' },
    stats: { icon: '📊', name: '数据舱', sub: '复盘让下一周更强' }
};

// 星球进化阶段
const TIERS = {
    1: { name: '星尘', desc: '一切从一粒尘埃开始' },
    2: { name: '陨石', desc: '开始有了形状' },
    3: { name: '小行星', desc: '在轨道上站稳了脚跟' },
    4: { name: '岩石行星', desc: '坚硬的核心正在形成' },
    5: { name: '海洋行星', desc: '生命的摇篮出现了' },
    6: { name: '翠绿行星', desc: '万物生长，欣欣向荣' },
    7: { name: '文明行星', desc: '夜晚的灯火属于你的坚持' },
    8: { name: '恒星', desc: '你已成为照亮别人的光' }
};

const QUOTES = [
    '自律不是苦行，是把选择权拿回自己手里',
    '你今天的每一次打卡，都是星球的一次心跳',
    '不必追求完美的一天，只要比昨天多做一点',
    '专注 25 分钟，比焦虑 2 小时有用',
    '拖延的代价明天才付，行动的奖励现在就领',
    '连续打卡的第 7 天，习惯开始替你工作',
    '别小看 +10 能量，恒星也是一粒尘埃变的',
    '真正的对手不是搭档，是昨天的自己',
    '把大目标拆成小任务，把小任务变成打卡',
    '休息也是任务的一部分，兑换奖励别手软',
    '失败记录不可怕，可怕的是不写复盘',
    '你在专注舱的每一分钟，宇宙都看得见',
    '积分会花完，但等级永远是你的',
    '今天的你，是搭档眼里的榜样还是反面教材？',
    '星球不会一夜进化，但每天都在变'
];

// UI 音效：柔和正弦 blip
let audioCtx = null;
function blip(freq = 1200, duration = 0.06, volume = 0.05) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* 忽略 */ }
}

// 生成星空
function makeStars() {
    const wrap = document.getElementById('stars');
    if (!wrap) return;
    for (let i = 0; i < 90; i++) {
        const s = document.createElement('span');
        s.className = 'star';
        const size = Math.random() < 0.85 ? 1 : 2;
        s.style.width = s.style.height = size + 'px';
        s.style.left = Math.random() * 100 + '%';
        s.style.top = Math.random() * 100 + '%';
        s.style.animationDelay = (Math.random() * 3).toFixed(2) + 's';
        s.style.animationDuration = (2 + Math.random() * 3).toFixed(2) + 's';
        if (Math.random() < 0.12) s.style.background = '#ffd166';
        wrap.appendChild(s);
    }
}

const { createApp } = Vue;

createApp({
    data() {
        return {
            view: location.hash.slice(1) || 'base',
            profile: null,
            habits: [],
            tasks: [],
            todayTasks: [],
            focusToday: { minutes: 0, count: 0, sessions: [] },
            toasts: [],
            toastSeq: 0,
            quote: QUOTES[Math.floor(Date.now() / 86400000) % QUOTES.length],
            // 表单
            habitForm: { name: '', icon: '' },
            taskForm: { title: '', type: 'DAILY', dueDate: '', points: 20 },
            rewardForm: { name: '', icon: '', cost: 100 },
            // 商店
            rewards: [],
            // 搭档
            inviteCode: '',
            bindCode: '',
            me: null,
            partner: null,
            nudges: [],
            unreadNudges: 0,
            latestNudge: null,
            partnerFeed: [],
            nudgeMessage: '',
            // 热力图
            heatmapHabit: null,
            heatmapYear: new Date().getFullYear(),
            // 番茄钟
            pomoMinutes: 25,
            pomoTaskId: null,
            remainingSeconds: 25 * 60,
            timerRunning: false,
            timerPaused: false,
            timerHandle: null,
            // 统计
            statsRange: 'week',
            statsTotals: null,
            statsDays: [],
            reviews: [],
            reviewContent: ''
        };
    },

    computed: {
        viewTitle() {
            return VIEW_TITLES[this.view] || VIEW_TITLES.base;
        },
        levelPercent() {
            if (!this.profile) return 0;
            const p = this.profile.levelProgress;
            return p.needed === 0 ? 100 : Math.min(100, Math.round(p.current * 100 / p.needed));
        },
        recentFailures() {
            return this.profile ? this.profile.recentFailures : [];
        },
        earnedCount() {
            return this.profile ? this.profile.achievements.filter(a => a.earned).length : 0;
        },
        checkedCount() {
            return this.habits.filter(h => h.checkedToday).length;
        },
        doneTodayCount() {
            return this.todayTasks.filter(t => t.status === 'DONE').length;
        },
        pendingTasks() {
            return this.todayTasks.filter(t => t.status === 'PENDING');
        },
        partnerName() {
            return this.partner ? this.partner.nickname : '';
        },
        timerDisplay() {
            const m = Math.floor(this.remainingSeconds / 60);
            const s = this.remainingSeconds % 60;
            return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        },
        ringPercent() {
            const total = this.pomoMinutes * 60;
            if (!total) return 0;
            return Math.round((total - this.remainingSeconds) / total * 100);
        },
        taskGroups() {
            const groups = [
                { type: 'DAILY', label: '📅 每日任务（每晚 0 点重置，未完成扣分）', items: [] },
                { type: 'WEEKLY', label: '🗓️ 每周任务（周一重置）', items: [] },
                { type: 'ONCE', label: '🎯 一次性任务', items: [] }
            ];
            for (const t of this.tasks) {
                const g = groups.find(g => g.type === t.type);
                if (g) g.items.push(t);
            }
            return groups;
        }
    },

    methods: {
        // ---- 星球阶段 ----
        tierOf(level) {
            if (level >= 10) return 8;
            if (level >= 8) return 7;
            if (level >= 6) return 6;
            return Math.max(1, Math.min(level, 5));
        },
        tierInfo(level) {
            return TIERS[this.tierOf(level)];
        },
        planetClass(level) {
            const t = this.tierOf(level);
            return ['t' + t, t >= 6 ? 'ringed' : ''];
        },
        pkPercent(mine, theirs) {
            const a = Math.max(0, mine), b = Math.max(0, theirs);
            if (a + b === 0) return 50;
            return Math.round(a * 100 / (a + b));
        },
        kindIcon(kind) {
            return {
                CHECKIN: '✅', TASK: '📋', FOCUS: '⏱️', ACHIEVEMENT: '🏅',
                STREAK: '🔥', PUNISH: '💥', REDEEM: '🛍️'
            }[kind] || '✨';
        },

        go(view) {
            blip();
            this.view = view;
            location.hash = view;
            if (view === 'stats') {
                this.loadStats(this.statsRange);
                this.loadReviews();
            }
            if (view === 'habits') this.heatmapHabit = null;
            if (view === 'shop') this.loadRewards();
            if (view === 'partner') this.loadPartner(true);
        },

        logout() {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            location.href = '/login.html';
        },

        fmtTime(iso) {
            if (!iso) return '';
            return String(iso).replace('T', ' ').slice(5, 16);
        },
        typeLabel(t) {
            return { DAILY: '每日', WEEKLY: '每周', ONCE: '单次' }[t] || t;
        },
        statusLabel(s) {
            return { PENDING: '进行中', DONE: '完成', FAILED: '失败' }[s] || s;
        },

        toast(msg, alert = false) {
            const id = ++this.toastSeq;
            this.toasts.push({ id, msg, alert });
            blip(alert ? 520 : 1560, 0.08);
            setTimeout(() => {
                this.toasts = this.toasts.filter(t => t.id !== id);
            }, 3200);
        },

        // ---- 数据加载 ----
        async loadProfile() {
            this.profile = await api('/api/profile');
        },
        async loadHabits() {
            this.habits = await api('/api/habits');
        },
        async loadTasks() {
            this.tasks = await api('/api/tasks');
            this.todayTasks = await api('/api/tasks/today');
        },
        async loadFocus() {
            this.focusToday = await api('/api/focus/today');
        },
        async loadRewards() {
            this.rewards = await api('/api/rewards');
        },
        async loadPartner(withDetails = false) {
            const data = await api('/api/partner');
            this.inviteCode = data.inviteCode;
            this.me = data.me;
            this.partner = data.partner;
            this.nudges = data.nudges || [];
            if (data.unreadNudges > 0) {
                // 只有新消息才在首页横幅展示
                this.latestNudge = this.nudges[0] || null;
                this.toast(`🔔 搭档给你发来了 ${data.unreadNudges} 条消息`);
            }
            this.unreadNudges = 0; // 后端已标记已读
            if (withDetails && this.partner) {
                this.partnerFeed = await api('/api/partner/feed');
                this.renderCompare();
            }
        },
        async loadAll() {
            await Promise.all([
                this.loadProfile(), this.loadHabits(), this.loadTasks(),
                this.loadFocus(), this.loadPartner()
            ]);
        },

        // ---- 习惯 ----
        async addHabit() {
            if (!this.habitForm.name) return;
            try {
                await api('/api/habits', { method: 'POST', body: JSON.stringify(this.habitForm) });
                this.habitForm = { name: '', icon: '' };
                await this.loadHabits();
                this.toast('✅ 新习惯已创建，今天就打个卡吧');
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async checkin(habit) {
            try {
                const r = await api(`/api/habits/${habit.id}/checkin`, { method: 'POST', body: '{}' });
                await Promise.all([this.loadHabits(), this.loadProfile()]);
                this.toast(`🔥 打卡成功！连续 ${r.streak} 天 · 星球获得 10 能量`);
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async removeHabit(habit) {
            if (!confirm(`确定删除习惯「${habit.name}」？历史打卡记录会保留。`)) return;
            await api(`/api/habits/${habit.id}`, { method: 'DELETE' });
            if (this.heatmapHabit && this.heatmapHabit.id === habit.id) this.heatmapHabit = null;
            await this.loadHabits();
        },
        async showHeatmap(habit) {
            blip();
            this.heatmapHabit = habit;
            const data = await api(`/api/habits/${habit.id}/heatmap?year=${this.heatmapYear}`);
            this.$nextTick(() => {
                const el = document.getElementById('heatmap');
                const chart = echarts.getInstanceByDom(el) || echarts.init(el);
                chart.setOption({
                    tooltip: { formatter: p => p.value[0] },
                    visualMap: { show: false, min: 0, max: 1, inRange: { color: ['rgba(120,140,220,.15)', C.cyan] } },
                    calendar: {
                        range: String(this.heatmapYear),
                        cellSize: ['auto', 14],
                        left: 40, right: 10, top: 30,
                        itemStyle: { borderWidth: 2, borderColor: '#141b40', color: 'rgba(120,140,220,.08)' },
                        splitLine: { lineStyle: { color: C.dim, width: 1 } },
                        dayLabel: { nameMap: 'ZH', fontSize: 10, color: C.dim },
                        monthLabel: { nameMap: 'ZH', fontSize: 10, color: C.dim },
                        yearLabel: { show: false }
                    },
                    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }]
                });
            });
        },

        // ---- 任务 ----
        async addTask() {
            if (!this.taskForm.title) return;
            try {
                const body = { ...this.taskForm };
                if (body.type !== 'ONCE' || !body.dueDate) delete body.dueDate;
                await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
                this.taskForm = { title: '', type: this.taskForm.type, dueDate: '', points: 20 };
                await this.loadTasks();
                this.toast('📋 任务已创建');
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async completeTask(task) {
            try {
                await api(`/api/tasks/${task.id}/complete`, { method: 'POST' });
                await Promise.all([this.loadTasks(), this.loadProfile()]);
                this.toast(`🎉 任务完成！星球获得 ${task.points} 能量 +${task.points} P`);
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async removeTask(task) {
            if (!confirm(`确定删除任务「${task.title}」？`)) return;
            await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
            await this.loadTasks();
        },

        // ---- 商店 ----
        async addReward() {
            if (!this.rewardForm.name || !this.rewardForm.cost) return;
            try {
                await api('/api/rewards', { method: 'POST', body: JSON.stringify(this.rewardForm) });
                this.rewardForm = { name: '', icon: '', cost: 100 };
                await this.loadRewards();
                this.toast('🛍️ 奖励已上架');
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async redeem(reward) {
            if (!confirm(`确定花 ${reward.cost} P 兑换「${reward.name}」？`)) return;
            try {
                const r = await api(`/api/rewards/${reward.id}/redeem`, { method: 'POST' });
                await this.loadProfile();
                this.toast(`🎁 兑换成功，好好享受「${reward.name}」！余额 ${r.balance} P`);
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async removeReward(reward) {
            if (!confirm(`下架奖励「${reward.name}」？`)) return;
            await api(`/api/rewards/${reward.id}`, { method: 'DELETE' });
            await this.loadRewards();
        },

        // ---- 搭档 ----
        copyCode() {
            navigator.clipboard?.writeText(this.inviteCode);
            this.toast('📋 邀请码已复制，发给你的搭档吧');
        },
        async bindPartner() {
            if (!this.bindCode) return;
            try {
                const r = await api('/api/partner/bind', {
                    method: 'POST',
                    body: JSON.stringify({ code: this.bindCode })
                });
                this.bindCode = '';
                await this.loadPartner(true);
                this.toast(`🤝 绑定成功！和 ${r.partnerNickname} 一起加油吧`);
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async unbindPartner() {
            if (!confirm('确定解除搭档关系？')) return;
            await api('/api/partner', { method: 'DELETE' });
            this.partner = null;
            this.partnerFeed = [];
            await this.loadPartner();
            this.toast('已解除绑定');
        },
        async sendNudge(type) {
            try {
                await api('/api/partner/nudge', {
                    method: 'POST',
                    body: JSON.stringify({ type, message: this.nudgeMessage || null })
                });
                this.nudgeMessage = '';
                this.toast(type === 'CHEER' ? '👏 已给搭档送上鼓励' : '👉 已戳搭档，让 TA 快去学习');
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async renderCompare() {
            try {
                const data = await api('/api/partner/compare?range=week');
                this.$nextTick(() => {
                    const el = document.getElementById('compareChart');
                    if (!el) return;
                    const chart = echarts.getInstanceByDom(el) || echarts.init(el);
                    const dates = data.me.days.map(d => d.date.slice(5));
                    chart.setOption({
                        tooltip: { trigger: 'axis', backgroundColor: C.bg, borderColor: C.border, textStyle: { color: '#e9edff', fontSize: 12 } },
                        legend: { data: ['我', this.partner.nickname], textStyle: { color: C.dim, fontSize: 11 } },
                        grid: { left: 40, right: 20, bottom: 28, top: 40 },
                        xAxis: { type: 'category', data: dates, axisLine: { lineStyle: { color: C.dim } }, axisLabel: { color: C.dim, fontSize: 10 } },
                        yAxis: { type: 'value', axisLabel: { color: C.dim, fontSize: 10 }, splitLine: { lineStyle: { color: 'rgba(120,140,220,.12)' } } },
                        series: [
                            { name: '我', type: 'line', smooth: true, data: data.me.days.map(d => d.focusMinutes), itemStyle: { color: C.cyan }, areaStyle: { color: 'rgba(87,230,213,.12)' } },
                            { name: this.partner.nickname, type: 'line', smooth: true, data: data.partner.days.map(d => d.focusMinutes), itemStyle: { color: C.coral }, areaStyle: { color: 'rgba(255,107,129,.10)' } }
                        ]
                    });
                });
            } catch (e) { /* 无搭档时忽略 */ }
        },

        // ---- 番茄钟 ----
        startTimer() {
            blip(880, 0.1);
            if (!this.timerPaused) {
                this.remainingSeconds = this.pomoMinutes * 60;
            }
            this.timerRunning = true;
            this.timerPaused = false;
            this.timerHandle = setInterval(() => {
                this.remainingSeconds--;
                document.title = `🚀 ${this.timerDisplay} · 自律星球`;
                if (this.remainingSeconds <= 0) {
                    this.finishTimer();
                }
            }, 1000);
        },
        pauseTimer() {
            blip(660);
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = true;
        },
        resetTimer() {
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = false;
            this.remainingSeconds = this.pomoMinutes * 60;
            document.title = '自律星球 · 用自律养大你的星球';
        },
        async finishTimer() {
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = false;
            document.title = '自律星球 · 用自律养大你的星球';
            this.victoryChime();
            try {
                await api('/api/focus', {
                    method: 'POST',
                    body: JSON.stringify({ taskId: this.pomoTaskId, durationMinutes: this.pomoMinutes })
                });
                await Promise.all([this.loadFocus(), this.loadProfile()]);
                this.toast(`🛬 着陆成功！专注 ${this.pomoMinutes} 分钟，休息一下吧`);
            } catch (e) {
                this.toast(e.message, true);
            }
            this.remainingSeconds = this.pomoMinutes * 60;
        },
        victoryChime() {
            [660, 880, 1108, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.22, 0.09), i * 150));
        },

        // ---- 统计 ----
        async loadStats(range) {
            this.statsRange = range;
            const data = await api(`/api/stats/summary?range=${range}`);
            this.statsTotals = data.totals;
            this.statsDays = data.days;
            this.$nextTick(() => this.renderTrend());
        },
        renderTrend() {
            const el = document.getElementById('trendChart');
            if (!el) return;
            const chart = echarts.getInstanceByDom(el) || echarts.init(el);
            const axis = {
                axisLine: { lineStyle: { color: C.dim } },
                axisLabel: { color: C.dim, fontSize: 10 },
                splitLine: { lineStyle: { color: 'rgba(120,140,220,.12)' } }
            };
            chart.setOption({
                tooltip: { trigger: 'axis', backgroundColor: C.bg, borderColor: C.border, textStyle: { color: '#e9edff', fontSize: 12 } },
                legend: { data: ['专注(分钟)', '任务完成', '打卡'], textStyle: { color: C.dim, fontSize: 11 } },
                grid: { left: 44, right: 24, bottom: 30, top: 44 },
                xAxis: { type: 'category', data: this.statsDays.map(d => d.date.slice(5)), ...axis },
                yAxis: [
                    { type: 'value', name: '分钟', nameTextStyle: { color: C.dim }, ...axis },
                    { type: 'value', name: '次数', minInterval: 1, nameTextStyle: { color: C.dim }, ...axis }
                ],
                series: [
                    {
                        name: '专注(分钟)', type: 'bar',
                        data: this.statsDays.map(d => d.focusMinutes),
                        itemStyle: { color: C.purple, borderRadius: [4, 4, 0, 0] }, barMaxWidth: 18
                    },
                    {
                        name: '任务完成', type: 'line', yAxisIndex: 1, smooth: true,
                        data: this.statsDays.map(d => d.tasksDone),
                        itemStyle: { color: C.gold }, lineStyle: { width: 2 }
                    },
                    {
                        name: '打卡', type: 'line', yAxisIndex: 1, smooth: true,
                        data: this.statsDays.map(d => d.checkins),
                        itemStyle: { color: C.cyan }, lineStyle: { width: 2 }
                    }
                ]
            });
        },
        async loadReviews() {
            this.reviews = await api('/api/reviews');
            const today = new Date().toISOString().slice(0, 10);
            const mine = this.reviews.find(r => r.reviewDate === today);
            this.reviewContent = mine ? mine.content : '';
        },
        async saveReview() {
            if (!this.reviewContent.trim()) return;
            try {
                await api('/api/reviews', {
                    method: 'POST',
                    body: JSON.stringify({ content: this.reviewContent })
                });
                await this.loadReviews();
                this.toast('📝 复盘已保存，星球的裂缝修复了一点');
            } catch (e) {
                this.toast(e.message, true);
            }
        }
    },

    async mounted() {
        makeStars();
        try {
            await this.loadAll();
        } catch (e) {
            console.error(e);
        }
        if (this.view === 'stats') {
            this.loadStats('week');
            this.loadReviews();
        }
        if (this.view === 'shop') this.loadRewards();
        if (this.view === 'partner') this.loadPartner(true);
        window.addEventListener('hashchange', () => {
            const v = location.hash.slice(1);
            if (VIEW_TITLES[v] && v !== this.view) this.go(v);
        });
    }
}).mount('#app');
