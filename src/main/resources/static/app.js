// ===== 自律星球 前端逻辑 =====
const TOKEN = localStorage.getItem('token');
if (!TOKEN) {
    location.href = '/login.html';
}

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
    today: '今日看板',
    habits: '习惯打卡',
    tasks: '任务清单',
    pomodoro: '番茄钟',
    stats: '统计复盘'
};

const { createApp } = Vue;

createApp({
    data() {
        return {
            view: location.hash.slice(1) || 'today',
            profile: null,
            habits: [],
            tasks: [],
            todayTasks: [],
            focusToday: { minutes: 0, count: 0, sessions: [] },
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
                { type: 'DAILY', label: '📅 每日任务（每天 0 点重置，未完成扣分）', items: [] },
                { type: 'WEEKLY', label: '🗓 每周任务（周一重置）', items: [] },
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
        go(view) {
            this.view = view;
            location.hash = view;
            if (view === 'stats') {
                this.loadStats(this.statsRange);
                this.loadReviews();
            }
            if (view === 'habits') {
                this.heatmapHabit = null;
            }
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
            return { DAILY: '每日', WEEKLY: '每周', ONCE: '一次' }[t] || t;
        },

        statusLabel(s) {
            return { PENDING: '进行中', DONE: '完成', FAILED: '失败' }[s] || s;
        },

        toast(msg) {
            alert(msg);
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

        // ---- 习惯 ----
        async addHabit() {
            if (!this.habitForm.name) return;
            try {
                await api('/api/habits', { method: 'POST', body: JSON.stringify(this.habitForm) });
                this.habitForm = { name: '', icon: '' };
                await this.loadHabits();
            } catch (e) {
                this.toast(e.message);
            }
        },
        async checkin(habit) {
            try {
                const r = await api(`/api/habits/${habit.id}/checkin`, { method: 'POST', body: '{}' });
                await Promise.all([this.loadHabits(), this.loadProfile()]);
                this.toast(`打卡成功！🔥 已连续 ${r.streak} 天，+10 XP +10 积分`);
            } catch (e) {
                this.toast(e.message);
            }
        },
        async removeHabit(habit) {
            if (!confirm(`确定删除习惯「${habit.name}」？历史打卡记录会保留。`)) return;
            await api(`/api/habits/${habit.id}`, { method: 'DELETE' });
            if (this.heatmapHabit && this.heatmapHabit.id === habit.id) this.heatmapHabit = null;
            await this.loadHabits();
        },
        async showHeatmap(habit) {
            this.heatmapHabit = habit;
            const data = await api(`/api/habits/${habit.id}/heatmap?year=${this.heatmapYear}`);
            this.$nextTick(() => {
                const el = document.getElementById('heatmap');
                const chart = echarts.getInstanceByDom(el) || echarts.init(el);
                chart.setOption({
                    tooltip: { formatter: p => p.value[0] },
                    visualMap: { show: false, min: 0, max: 1, inRange: { color: ['#ebedf0', habit.color || '#5470c6'] } },
                    calendar: {
                        range: String(this.heatmapYear),
                        cellSize: ['auto', 14],
                        left: 40, right: 10, top: 30,
                        itemStyle: { borderWidth: 2, borderColor: '#fff' },
                        dayLabel: { nameMap: 'ZH', fontSize: 10 },
                        monthLabel: { nameMap: 'ZH', fontSize: 10 },
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
            } catch (e) {
                this.toast(e.message);
            }
        },
        async completeTask(task) {
            try {
                await api(`/api/tasks/${task.id}/complete`, { method: 'POST' });
                await Promise.all([this.loadTasks(), this.loadProfile()]);
                this.toast(`任务完成！+${task.points} XP +${task.points} 积分 🎉`);
            } catch (e) {
                this.toast(e.message);
            }
        },
        async removeTask(task) {
            if (!confirm(`确定删除任务「${task.title}」？`)) return;
            await api(`/api/tasks/${task.id}`, { method: 'DELETE' });
            await this.loadTasks();
        },

        // ---- 番茄钟 ----
        startTimer() {
            if (!this.timerPaused) {
                this.remainingSeconds = this.pomoMinutes * 60;
            }
            this.timerRunning = true;
            this.timerPaused = false;
            this.timerHandle = setInterval(() => {
                this.remainingSeconds--;
                document.title = `🍅 ${this.timerDisplay} - 自律星球`;
                if (this.remainingSeconds <= 0) {
                    this.finishTimer();
                }
            }, 1000);
        },
        pauseTimer() {
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = true;
        },
        resetTimer() {
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = false;
            this.remainingSeconds = this.pomoMinutes * 60;
            document.title = '自律星球';
        },
        async finishTimer() {
            clearInterval(this.timerHandle);
            this.timerRunning = false;
            this.timerPaused = false;
            document.title = '自律星球';
            this.beep();
            try {
                await api('/api/focus', {
                    method: 'POST',
                    body: JSON.stringify({ taskId: this.pomoTaskId, durationMinutes: this.pomoMinutes })
                });
                await Promise.all([this.loadFocus(), this.loadProfile()]);
                this.toast(`🍅 专注 ${this.pomoMinutes} 分钟完成！休息一下吧`);
            } catch (e) {
                this.toast(e.message);
            }
            this.remainingSeconds = this.pomoMinutes * 60;
        },
        beep() {
            try {
                const ctx = new (window.AudioContext || window.webkitAudioContext)();
                [0, 0.25, 0.5].forEach(delay => {
                    const osc = ctx.createOscillator();
                    const gain = ctx.createGain();
                    osc.connect(gain);
                    gain.connect(ctx.destination);
                    osc.frequency.value = 880;
                    gain.gain.setValueAtTime(0.3, ctx.currentTime + delay);
                    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.2);
                    osc.start(ctx.currentTime + delay);
                    osc.stop(ctx.currentTime + delay + 0.2);
                });
            } catch (e) { /* 忽略音频错误 */ }
        },

        // ---- 统计复盘 ----
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
            chart.setOption({
                tooltip: { trigger: 'axis' },
                legend: { data: ['专注(分钟)', '完成任务', '打卡'] },
                grid: { left: 40, right: 20, bottom: 30, top: 40 },
                xAxis: { type: 'category', data: this.statsDays.map(d => d.date.slice(5)) },
                yAxis: [
                    { type: 'value', name: '分钟' },
                    { type: 'value', name: '次数', minInterval: 1 }
                ],
                series: [
                    { name: '专注(分钟)', type: 'bar', data: this.statsDays.map(d => d.focusMinutes), itemStyle: { color: '#5470c6' } },
                    { name: '完成任务', type: 'line', yAxisIndex: 1, data: this.statsDays.map(d => d.tasksDone), itemStyle: { color: '#67c23a' } },
                    { name: '打卡', type: 'line', yAxisIndex: 1, data: this.statsDays.map(d => d.checkins), itemStyle: { color: '#e6a23c' } }
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
                this.toast('复盘已保存 📝');
            } catch (e) {
                this.toast(e.message);
            }
        }
    },

    async mounted() {
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
            if (VIEW_TITLES[v]) this.go(v);
        });
    }
}).mount('#app');
