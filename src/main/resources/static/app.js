// ===== 自律星球 前端逻辑（YoRHa 主题） =====
const TOKEN = localStorage.getItem('token');
if (!TOKEN) {
    location.href = '/login.html';
}

// YoRHa 配色（与 style.css 保持一致）
const C = {
    ink: '#454138',
    inkSoft: '#6e6a5e',
    inkFaint: 'rgba(69,65,56,.14)',
    paper: '#d1cdb7',
    alert: '#b0563f',
    gold: '#937f4e'
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
    today: '作战简报 / BRIEFING',
    habits: '日常协议 / PROTOCOL',
    tasks: '任务档案 / QUEST LOG',
    pomodoro: '专注作战 / FOCUS OP.',
    stats: '作战记录 / ARCHIVE'
};

// 标题解码动画用字符集
const SCRAMBLE_CHARS = '01ABCDEF■□◆◇/\\|-_';

// UI 电子音：短促方波 blip
let audioCtx = null;
function blip(freq = 1320, duration = 0.045, volume = 0.06) {
    try {
        audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'square';
        osc.frequency.value = freq;
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        gain.gain.setValueAtTime(volume, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) { /* 忽略音频错误 */ }
}

const { createApp } = Vue;

createApp({
    data() {
        return {
            view: location.hash.slice(1) || 'today',
            displayTitle: '',
            scrambleHandle: null,
            profile: null,
            habits: [],
            tasks: [],
            todayTasks: [],
            focusToday: { minutes: 0, count: 0, sessions: [] },
            toasts: [],
            toastSeq: 0,
            // 表单
            habitForm: { name: '', icon: '' },
            taskForm: { title: '', type: 'DAILY', dueDate: '', points: 20 },
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
            return VIEW_TITLES[this.view] || '';
        },
        levelPercent() {
            if (!this.profile) return 0;
            const p = this.profile.levelProgress;
            return p.needed === 0 ? 100 : Math.min(100, Math.round(p.current * 100 / p.needed));
        },
        /** XP 进度切成 24 个方块 */
        xpSegments() {
            const filled = Math.round(this.levelPercent / 100 * 24);
            return Array.from({ length: 24 }, (_, i) => i < filled);
        },
        recentFailures() {
            return this.profile ? this.profile.recentFailures : [];
        },
        earnedCount() {
            return this.profile ? this.profile.achievements.filter(a => a.earned).length : 0;
        },
        pendingTasks() {
            return this.todayTasks.filter(t => t.status === 'PENDING');
        },
        timerDisplay() {
            const m = Math.floor(this.remainingSeconds / 60);
            const s = this.remainingSeconds % 60;
            return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
        },
        taskGroups() {
            const groups = [
                { type: 'DAILY', label: '每日任务（0 点重置，未完成扣 P）', items: [] },
                { type: 'WEEKLY', label: '每周任务（周一重置）', items: [] },
                { type: 'ONCE', label: '单次任务', items: [] }
            ];
            for (const t of this.tasks) {
                const g = groups.find(g => g.type === t.type);
                if (g) g.items.push(t);
            }
            return groups;
        }
    },

    methods: {
        go(view) {
            blip();
            this.view = view;
            location.hash = view;
            this.scrambleTitle();
            if (view === 'stats') {
                this.loadStats(this.statsRange);
                this.loadReviews();
            }
            if (view === 'habits') {
                this.heatmapHabit = null;
            }
        },

        /** 标题解码动画：乱码逐位落定 */
        scrambleTitle() {
            clearInterval(this.scrambleHandle);
            const target = this.viewTitle;
            let frame = 0;
            const totalFrames = 14;
            this.scrambleHandle = setInterval(() => {
                frame++;
                const solved = Math.floor(target.length * frame / totalFrames);
                this.displayTitle = target.slice(0, solved) +
                    Array.from({ length: target.length - solved },
                        () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)]).join('');
                if (frame >= totalFrames) {
                    this.displayTitle = target;
                    clearInterval(this.scrambleHandle);
                }
            }, 28);
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
            blip(alert ? 440 : 1760, 0.06);
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
        async loadAll() {
            await Promise.all([this.loadProfile(), this.loadHabits(), this.loadTasks(), this.loadFocus()]);
        },

        // ---- 日常协议 ----
        async addHabit() {
            if (!this.habitForm.name) return;
            try {
                await api('/api/habits', { method: 'POST', body: JSON.stringify(this.habitForm) });
                this.habitForm = { name: '', icon: '' };
                await this.loadHabits();
                this.toast('协议已登记');
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async checkin(habit) {
            try {
                const r = await api(`/api/habits/${habit.id}/checkin`, { method: 'POST', body: '{}' });
                await Promise.all([this.loadHabits(), this.loadProfile()]);
                this.toast(`协议执行完毕 — STREAK ${r.streak} — +10 XP +10 P`);
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async removeHabit(habit) {
            if (!confirm(`确定废止协议「${habit.name}」？历史执行记录会保留。`)) return;
            await api(`/api/habits/${habit.id}`, { method: 'DELETE' });
            if (this.heatmapHabit && this.heatmapHabit.id === habit.id) this.heatmapHabit = null;
            await this.loadHabits();
            this.toast('协议已废止');
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
                    visualMap: { show: false, min: 0, max: 1, inRange: { color: [C.inkFaint, C.ink] } },
                    calendar: {
                        range: String(this.heatmapYear),
                        cellSize: ['auto', 14],
                        left: 40, right: 10, top: 30,
                        itemStyle: { borderWidth: 2, borderColor: C.paper, color: 'rgba(69,65,56,.05)' },
                        splitLine: { lineStyle: { color: C.ink, width: 1 } },
                        dayLabel: { nameMap: 'ZH', fontSize: 10, color: C.inkSoft },
                        monthLabel: { nameMap: 'ZH', fontSize: 10, color: C.inkSoft },
                        yearLabel: { show: false }
                    },
                    series: [{ type: 'heatmap', coordinateSystem: 'calendar', data }]
                });
            });
        },

        // ---- 任务档案 ----
        async addTask() {
            if (!this.taskForm.title) return;
            try {
                const body = { ...this.taskForm };
                if (body.type !== 'ONCE' || !body.dueDate) delete body.dueDate;
                await api('/api/tasks', { method: 'POST', body: JSON.stringify(body) });
                this.taskForm = { title: '', type: this.taskForm.type, dueDate: '', points: 20 };
                await this.loadTasks();
                this.toast('任务已部署');
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async completeTask(task) {
            try {
                await api(`/api/tasks/${task.id}/complete`, { method: 'POST' });
                await Promise.all([this.loadTasks(), this.loadProfile()]);
                this.toast(`任务完成 — 获得赏金 +${task.points} XP +${task.points} P`);
            } catch (e) {
                this.toast(e.message, true);
            }
        },
        async removeTask(task) {
            if (!confirm(`确定销毁任务「${task.title}」？`)) return;
            await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
            await this.loadTasks();
            this.toast('任务已销毁');
        },

        // ---- 专注作战 ----
        startTimer() {
            blip(880, 0.08);
            if (!this.timerPaused) {
                this.remainingSeconds = this.pomoMinutes * 60;
            }
            this.timerRunning = true;
            this.timerPaused = false;
            this.timerHandle = setInterval(() => {
                this.remainingSeconds--;
                document.title = `▶ ${this.timerDisplay} - 自律星球`;
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
            document.title = '自律星球 - SELF DISCIPLINE SYSTEM';
        },
        async finishTimer() {
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = false;
            document.title = '自律星球 - SELF DISCIPLINE SYSTEM';
            this.victoryChime();
            try {
                await api('/api/focus', {
                    method: 'POST',
                    body: JSON.stringify({ taskId: this.pomoTaskId, durationMinutes: this.pomoMinutes })
                });
                await Promise.all([this.loadFocus(), this.loadProfile()]);
                this.toast(`作战完成 — 专注 ${this.pomoMinutes} min — 短暂休整`);
            } catch (e) {
                this.toast(e.message, true);
            }
            this.remainingSeconds = this.pomoMinutes * 60;
        },
        /** 结束时的三连音 */
        victoryChime() {
            [880, 1108, 1318].forEach((f, i) => setTimeout(() => blip(f, 0.18, 0.1), i * 180));
        },

        // ---- 作战记录 ----
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
            const axisStyle = {
                axisLine: { lineStyle: { color: C.ink } },
                axisLabel: { color: C.inkSoft, fontFamily: 'Menlo, monospace', fontSize: 10 },
                splitLine: { lineStyle: { color: C.inkFaint } }
            };
            chart.setOption({
                tooltip: {
                    trigger: 'axis',
                    backgroundColor: C.ink,
                    borderWidth: 0,
                    textStyle: { color: C.paper, fontSize: 12 }
                },
                legend: {
                    data: ['专注(min)', '任务完成', '协议执行'],
                    textStyle: { color: C.inkSoft, fontSize: 11 },
                    itemWidth: 12, itemHeight: 8
                },
                grid: { left: 44, right: 24, bottom: 30, top: 44 },
                xAxis: { type: 'category', data: this.statsDays.map(d => d.date.slice(5)), ...axisStyle },
                yAxis: [
                    { type: 'value', name: 'min', nameTextStyle: { color: C.inkSoft }, ...axisStyle },
                    { type: 'value', name: '次', minInterval: 1, nameTextStyle: { color: C.inkSoft }, ...axisStyle }
                ],
                series: [
                    {
                        name: '专注(min)', type: 'bar',
                        data: this.statsDays.map(d => d.focusMinutes),
                        itemStyle: { color: C.ink }, barMaxWidth: 18
                    },
                    {
                        name: '任务完成', type: 'line', yAxisIndex: 1,
                        data: this.statsDays.map(d => d.tasksDone),
                        itemStyle: { color: C.gold }, lineStyle: { color: C.gold, width: 1.5 },
                        symbol: 'rect', symbolSize: 6
                    },
                    {
                        name: '协议执行', type: 'line', yAxisIndex: 1,
                        data: this.statsDays.map(d => d.checkins),
                        itemStyle: { color: C.alert }, lineStyle: { color: C.alert, width: 1.5, type: 'dashed' },
                        symbol: 'diamond', symbolSize: 7
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
                this.toast('复盘日志已写入');
            } catch (e) {
                this.toast(e.message, true);
            }
        }
    },

    async mounted() {
        this.scrambleTitle();
        try {
            await this.loadAll();
        } catch (e) {
            console.error(e);
        }
        if (this.view === 'stats') {
            this.loadStats('week');
            this.loadReviews();
        }
        window.addEventListener('hashchange', () => {
            const v = location.hash.slice(1);
            if (VIEW_TITLES[v] && v !== this.view) this.go(v);
        });
    }
}).mount('#app');
