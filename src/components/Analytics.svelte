<script>
    import { onMount } from 'svelte';
    import { assignments, tasks, projects, profile, currentTeam, teamMembers } from '$lib/stores';
    import { parseDateLocal } from '$lib/utils/date';
    import Chart from 'chart.js/auto';
    import { onMount as onMountChart } from 'svelte';

    let velocityChart;
    let timeAccuracyChart;
    let projectBreakdownChart;
    let teamVelocityChart;
    let workloadChart;

    // Analytics data
    let velocityData = [];
    let timeAccuracyData = [];
    let projectBreakdownData = [];
    let streakCount = 0;
    let aiCalibrationData = [];
    let teamAnalyticsData = {};

    // Export functionality
    let csvData = '';
    let pdfReport = '';

    onMount(() => {
        calculateAnalytics();
        initCharts();
    });

    function calculateAnalytics() {
        calculateVelocity();
        calculateTimeAccuracy();
        calculateProjectBreakdown();
        calculateStreaks();
        calculateAICalibration();
        
        if ($profile.subscription === 'team') {
            calculateTeamAnalytics();
        }
        
        generateCSVData();
        generatePDFReport();
    }

    function calculateVelocity() {
        // Get completed tasks/assignments per week for last 8 weeks
        const now = new Date();
        const weeks = [];
        
        for (let i = 7; i >= 0; i--) {
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - (i * 7) - now.getDay());
            weekStart.setHours(0, 0, 0, 0);
            
            const weekEnd = new Date(weekStart);
            weekEnd.setDate(weekStart.getDate() + 6);
            weekEnd.setHours(23, 59, 59, 999);
            
            const completedInWeek = [...$assignments, ...$tasks].filter(item => {
                if (item.status !== 'done') return false;
                const completedDate = parseDateLocal(item.updatedAt);
                return completedDate >= weekStart && completedDate <= weekEnd;
            }).length;
            
            weeks.push({
                week: `Week ${8 - i}`,
                count: completedInWeek,
                start: weekStart.toLocaleDateString()
            });
        }
        
        velocityData = weeks;
    }

    function calculateTimeAccuracy() {
        // Calculate estimated vs actual hours by task type
        const completedItems = [...$assignments, ...$tasks].filter(item => 
            item.status === 'done' && item.estimatedHours > 0
        );
        
        const byType = {};
        completedItems.forEach(item => {
            const type = item.type || 'Other';
            if (!byType[type]) {
                byType[type] = { estimated: 0, actual: 0, count: 0 };
            }
            byType[type].estimated += item.estimatedHours;
            byType[type].actual += item.actualHours || item.estimatedHours;
            byType[type].count++;
        });
        
        timeAccuracyData = Object.entries(byType).map(([type, data]) => ({
            type,
            estimated: data.estimated,
            actual: data.actual,
            variance: ((data.actual - data.estimated) / data.estimated * 100).toFixed(1),
            count: data.count
        }));
    }

    function calculateProjectBreakdown() {
        // Calculate time spent per project in last 30 days
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const projectTime = {};
        
        $tasks.forEach(task => {
            if (task.status === 'done' && task.projectId) {
                const completedDate = parseDateLocal(task.updatedAt);
                if (completedDate >= thirtyDaysAgo) {
                    if (!projectTime[task.projectId]) {
                        const project = $projects.find(p => p.id === task.projectId);
                        projectTime[task.projectId] = {
                            title: project ? project.title : 'Unknown Project',
                            hours: 0,
                            tasks: 0
                        };
                    }
                    projectTime[task.projectId].hours += task.actualHours || task.estimatedHours;
                    projectTime[task.projectId].tasks++;
                }
            }
        });
        
        // Also include assignments without projects
        const unassignedTasks = $tasks.filter(task => 
            task.status === 'done' && !task.projectId
        );
        
        if (unassignedTasks.length > 0) {
            const unassignedHours = unassignedTasks.reduce((sum, task) => 
                sum + (task.actualHours || task.estimatedHours), 0);
            projectTime['unassigned'] = {
                title: 'No Project',
                hours: unassignedHours,
                tasks: unassignedTasks.length
            };
        }
        
        projectBreakdownData = Object.values(projectTime);
    }

    function calculateStreaks() {
        // Calculate consecutive days with at least one task completed
        const completedDates = new Set();
        
        [...$assignments, ...$tasks]
            .filter(item => item.status === 'done')
            .forEach(item => {
                const date = parseDateLocal(item.updatedAt).toDateString();
                completedDates.add(date);
            });
        
        const sortedDates = Array.from(completedDates)
            .map(dateStr => new Date(dateStr))
            .sort((a, b) => b - a); // Most recent first
        
        let streak = 0;
        let currentDate = new Date();
        currentDate.setHours(0, 0, 0, 0);
        
        for (let i = 0; i < sortedDates.length; i++) {
            const checkDate = new Date(currentDate);
            checkDate.setDate(checkDate.getDate() - i);
            
            if (sortedDates.some(d => d.toDateString() === checkDate.toDateString())) {
                streak++;
            } else {
                break;
            }
        }
        
        streakCount = streak;
    }

    function calculateAICalibration() {
        // Analyze how priority scores and difficulty estimates have changed over time
        const analyzedItems = [...$assignments, ...$tasks]
            .filter(item => item.analyzedAt)
            .sort((a, b) => new Date(a.analyzedAt) - new Date(b.analyzedAt));
        
        // Group by week
        const weeklyData = {};
        analyzedItems.forEach(item => {
            const week = getWeekString(parseDateLocal(item.analyzedAt));
            if (!weeklyData[week]) {
                weeklyData[week] = { priorities: [], difficulties: [] };
            }
            weeklyData[week].priorities.push(item.priorityScore);
            weeklyData[week].difficulties.push(item.difficulty);
        });
        
        aiCalibrationData = Object.entries(weeklyData).map(([week, data]) => ({
            week,
            avgPriority: data.priorities.reduce((a, b) => a + b, 0) / data.priorities.length,
            avgDifficulty: data.difficulties.reduce((a, b) => a + b, 0) / data.difficulties.length,
            count: data.priorities.length
        }));
    }

    function calculateTeamAnalytics() {
        if (!$currentTeam) return;
        
        // Team velocity
        const teamTasks = $tasks.filter(task => 
            task.userId && teamMembers.some(m => m.userId === task.userId)
        );
        
        // Workload distribution
        const workload = {};
        teamMembers.forEach(member => {
            workload[member.userId] = {
                name: member.displayName,
                taskCount: 0,
                estimatedHours: 0
            };
        });
        
        teamTasks.forEach(task => {
            if (task.assignedTo && workload[task.assignedTo]) {
                workload[task.assignedTo].taskCount++;
                workload[task.assignedTo].estimatedHours += task.estimatedHours;
            }
        });
        
        // Blocker trends
        const blockedTasks = teamTasks
            .filter(task => task.status === 'blocked')
            .sort((a, b) => new Date(a.updatedAt) - new Date(b.updatedAt));
        
        teamAnalyticsData = {
            workload: Object.values(workload),
            blockedTasks,
            totalTasks: teamTasks.length,
            completedTasks: teamTasks.filter(t => t.status === 'done').length
        };
    }

    function generateCSVData() {
        const allItems = [...$assignments, ...$tasks];
        const headers = ['ID', 'Title', 'Type', 'Status', 'Priority Score', 'Estimated Hours', 'Actual Hours', 'Deadline', 'Created', 'Updated'];
        
        const rows = allItems.map(item => [
            item.id,
            `"${item.title.replace(/"/g, '""')}"`,
            item.type || item.entityType,
            item.status,
            item.priorityScore,
            item.estimatedHours,
            item.actualHours || '',
            item.deadline || '',
            item.createdAt,
            item.updatedAt
        ]);
        
        csvData = [headers.join(','), ...rows.map(row => row.join(','))].join('\n');
    }

    function generatePDFReport() {
        // Simple text-based report
        const completedCount = [...$assignments, ...$tasks].filter(i => i.status === 'done').length;
        const totalCount = $assignments.length + $tasks.length;
        
        pdfReport = `
Clerify Productivity Report
Generated: ${new Date().toLocaleDateString()}

SUMMARY
-------
Total Items: ${totalCount}
Completed: ${completedCount}
Completion Rate: ${totalCount > 0 ? ((completedCount / totalCount) * 100).toFixed(1) : 0}%
Current Streak: ${streakCount} days

VELOCITY (Last 8 Weeks)
-----------------------
${velocityData.map(w => `${w.week}: ${w.count} tasks`).join('\n')}

TIME ACCURACY
-------------
${timeAccuracyData.map(t => `${t.type}: Estimated ${t.estimated.toFixed(1)}h, Actual ${t.actual.toFixed(1)}h (${t.variance}% variance)`).join('\n')}

PROJECT BREAKDOWN (Last 30 Days)
--------------------------------
${projectBreakdownData.map(p => `${p.title}: ${p.hours.toFixed(1)}h across ${p.tasks} tasks`).join('\n')}
        `.trim();
    }

    function getWeekString(date) {
        const start = new Date(date);
        start.setDate(date.getDate() - date.getDay());
        return `Week of ${start.toLocaleDateString()}`;
    }

    function initCharts() {
        // Velocity Chart
        const velocityCtx = document.getElementById('velocityChart');
        if (velocityCtx) {
            velocityChart = new Chart(velocityCtx, {
                type: 'bar',
                data: {
                    labels: velocityData.map(d => d.week),
                    datasets: [{
                        label: 'Tasks Completed',
                        data: velocityData.map(d => d.count),
                        backgroundColor: 'rgba(99, 102, 241, 0.6)',
                        borderColor: 'rgba(99, 102, 241, 1)',
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        }

        // Time Accuracy Chart
        const timeCtx = document.getElementById('timeAccuracyChart');
        if (timeCtx) {
            timeAccuracyChart = new Chart(timeCtx, {
                type: 'bar',
                data: {
                    labels: timeAccuracyData.map(d => d.type),
                    datasets: [
                        {
                            label: 'Estimated Hours',
                            data: timeAccuracyData.map(d => d.estimated),
                            backgroundColor: 'rgba(59, 130, 246, 0.6)',
                            borderColor: 'rgba(59, 130, 246, 1)',
                            borderWidth: 1
                        },
                        {
                            label: 'Actual Hours',
                            data: timeAccuracyData.map(d => d.actual),
                            backgroundColor: 'rgba(239, 68, 68, 0.6)',
                            borderColor: 'rgba(239, 68, 68, 1)',
                            borderWidth: 1
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // Project Breakdown Chart
        const projectCtx = document.getElementById('projectBreakdownChart');
        if (projectCtx) {
            projectBreakdownChart = new Chart(projectCtx, {
                type: 'doughnut',
                data: {
                    labels: projectBreakdownData.map(d => d.title),
                    datasets: [{
                        data: projectBreakdownData.map(d => d.hours),
                        backgroundColor: [
                            'rgba(99, 102, 241, 0.6)',
                            'rgba(59, 130, 246, 0.6)',
                            'rgba(16, 185, 129, 0.6)',
                            'rgba(245, 158, 11, 0.6)',
                            'rgba(239, 68, 68, 0.6)',
                            'rgba(139, 92, 246, 0.6)'
                        ],
                        borderWidth: 1
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false
                }
            });
        }

        // Team Charts (if team user)
        if ($profile.subscription === 'team' && teamAnalyticsData.workload) {
            const workloadCtx = document.getElementById('workloadChart');
            if (workloadCtx) {
                workloadChart = new Chart(workloadCtx, {
                    type: 'bar',
                    data: {
                        labels: teamAnalyticsData.workload.map(w => w.name),
                        datasets: [{
                            label: 'Task Count',
                            data: teamAnalyticsData.workload.map(w => w.taskCount),
                            backgroundColor: 'rgba(99, 102, 241, 0.6)',
                            borderColor: 'rgba(99, 102, 241, 1)',
                            borderWidth: 1
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        indexAxis: 'y'
                    }
                });
            }
        }
    }

    function downloadCSV() {
        const blob = new Blob([csvData], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clerify-export-${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    }

    function downloadPDF() {
        const blob = new Blob([pdfReport], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `clerify-report-${new Date().toISOString().split('T')[0]}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    }
</script>

<div class="analytics-container">
    <div class="analytics-header">
        <h1>Productivity Analytics</h1>
        <div class="export-buttons">
            <button class="btn btn-secondary" on:click={downloadCSV}>
                <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg>
                Export CSV
            </button>
            {#if $profile.subscription === 'pro' || $profile.subscription === 'team'}
                <button class="btn btn-secondary" on:click={downloadPDF}>
                    <svg class="svg-icon" viewBox="0 0 24 24" width="16" height="16"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5V11H19v2h-1.5V7h3v1.5zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm10 5.5h1v-3h-1v3z"/></svg>
                    Export PDF Report
                </button>
            {/if}
        </div>
    </div>

    <div class="analytics-grid">
        <!-- Velocity Section -->
        <div class="analytics-card">
            <h2>Velocity</h2>
            <p class="text-muted">Tasks completed per week (last 8 weeks)</p>
            <div class="chart-container">
                <canvas id="velocityChart"></canvas>
            </div>
        </div>

        <!-- Time Accuracy Section -->
        <div class="analytics-card">
            <h2>Time Accuracy</h2>
            <p class="text-muted">Estimated vs actual hours by task type</p>
            <div class="chart-container">
                <canvas id="timeAccuracyChart"></canvas>
            </div>
            {#if timeAccuracyData.length > 0}
                <div class="accuracy-table">
                    <table>
                        <thead>
                            <tr>
                                <th>Type</th>
                                <th>Estimated</th>
                                <th>Actual</th>
                                <th>Variance</th>
                            </tr>
                        </thead>
                        <tbody>
                            {#each timeAccuracyData as item}
                                <tr>
                                    <td>{item.type}</td>
                                    <td>{item.estimated.toFixed(1)}h</td>
                                    <td>{item.actual.toFixed(1)}h</td>
                                    <td class:text-danger={parseFloat(item.variance) > 0} class:text-success={parseFloat(item.variance) < 0}>
                                        {item.variance}%
                                    </td>
                                </tr>
                            {/each}
                        </tbody>
                    </table>
                </div>
            {/if}
        </div>

        <!-- Project Breakdown Section -->
        <div class="analytics-card">
            <h2>Project Breakdown</h2>
            <p class="text-muted">Time distribution by project (last 30 days)</p>
            <div class="chart-container">
                <canvas id="projectBreakdownChart"></canvas>
            </div>
            {#if projectBreakdownData.length > 0}
                <div class="project-list">
                    {#each projectBreakdownData as project}
                        <div class="project-item">
                            <span class="project-title">{project.title}</span>
                            <span class="project-hours">{project.hours.toFixed(1)}h</span>
                            <span class="project-tasks">{project.tasks} tasks</span>
                        </div>
                    {/each}
                </div>
            {/if}
        </div>

        <!-- Streaks Section -->
        <div class="analytics-card streaks-card">
            <h2>Current Streak</h2>
            <div class="streak-display">
                <span class="streak-number">{streakCount}</span>
                <span class="streak-label">consecutive days</span>
            </div>
            <p class="text-muted">Keep it up! Complete at least one task each day.</p>
        </div>

        <!-- AI Calibration Section -->
        <div class="analytics-card">
            <h2>AI Calibration</h2>
            <p class="text-muted">How your estimates have evolved over time</p>
            {#if aiCalibrationData.length > 0}
                <div class="calibration-chart">
                    <div class="calibration-header">
                        <span>Avg Priority</span>
                        <span>Avg Difficulty</span>
                    </div>
                    {#each aiCalibrationData.slice(-4) as week}
                        <div class="calibration-row">
                            <span class="week-label">{week.week}</span>
                            <div class="bar-container">
                                <div class="bar priority-bar" style="width: {week.avgPriority}%"></div>
                                <div class="bar difficulty-bar" style="width: {week.avgDifficulty * 10}%"></div>
                            </div>
                            <span class="values">{week.avgPriority.toFixed(0)} / {(week.avgDifficulty).toFixed(1)}</span>
                        </div>
                    {/each}
                </div>
            {:else}
                <p class="text-muted">Not enough data yet. Complete more tasks to see calibration trends.</p>
            {/if}
        </div>

        <!-- Team Analytics (if team user) -->
        {#if $profile.subscription === 'team' && $currentTeam}
            <div class="analytics-card team-analytics">
                <h2>Team Analytics</h2>
                <p class="text-muted">Team performance metrics</p>
                
                <div class="team-stats">
                    <div class="team-stat">
                        <span class="team-stat-value">{teamAnalyticsData.totalTasks || 0}</span>
                        <span class="team-stat-label">Total Tasks</span>
                    </div>
                    <div class="team-stat">
                        <span class="team-stat-value">{teamAnalyticsData.completedTasks || 0}</span>
                        <span class="team-stat-label">Completed</span>
                    </div>
                    <div class="team-stat">
                        <span class="team-stat-value">{teamAnalyticsData.blockedTasks?.length || 0}</span>
                        <span class="team-stat-label">Blocked</span>
                    </div>
                </div>

                {#if teamAnalyticsData.workload && teamAnalyticsData.workload.length > 0}
                    <h3>Workload Distribution</h3>
                    <div class="chart-container">
                        <canvas id="workloadChart"></canvas>
                    </div>
                    
                    <div class="workload-table">
                        <table>
                            <thead>
                                <tr>
                                    <th>Member</th>
                                    <th>Tasks</th>
                                    <th>Est. Hours</th>
                                </tr>
                            </thead>
                            <tbody>
                                {#each teamAnalyticsData.workload as member}
                                    <tr>
                                        <td>{member.name}</td>
                                        <td>{member.taskCount}</td>
                                        <td>{member.estimatedHours.toFixed(1)}h</td>
                                    </tr>
                                {/each}
                            </tbody>
                        </table>
                    </div>
                {/if}

                {#if teamAnalyticsData.blockedTasks && teamAnalyticsData.blockedTasks.length > 0}
                    <h3>Blocked Tasks (Oldest First)</h3>
                    <div class="blocked-list">
                        {#each teamAnalyticsData.blockedTasks.slice(0, 5) as task}
                            <div class="blocked-item">
                                <span class="task-title">{task.title}</span>
                                <span class="blocked-since">Since {new Date(task.updatedAt).toLocaleDateString()}</span>
                            </div>
                        {/each}
                    </div>
                {/if}
            </div>
        {/if}
    </div>
</div>

<style>
    .analytics-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1rem;
    }
    
    .analytics-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 2rem;
        flex-wrap: wrap;
        gap: 1rem;
    }
    
    .analytics-header h1 {
        margin: 0;
        font-size: 1.5rem;
        font-weight: 600;
    }
    
    .export-buttons {
        display: flex;
        gap: 0.5rem;
    }
    
    .analytics-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    
    .analytics-card {
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        padding: 1.5rem;
        box-shadow: var(--shadow-sm);
    }
    
    .analytics-card h2 {
        margin: 0 0 0.5rem 0;
        font-size: 1.25rem;
        font-weight: 600;
    }
    
    .analytics-card h3 {
        margin: 1.5rem 0 0.75rem 0;
        font-size: 1rem;
        font-weight: 600;
    }
    
    .chart-container {
        height: 200px;
        margin: 1rem 0;
        position: relative;
    }
    
    .accuracy-table, .workload-table {
        margin-top: 1rem;
        overflow-x: auto;
    }
    
    table {
        width: 100%;
        border-collapse: collapse;
        font-size: 0.875rem;
    }
    
    th, td {
        padding: 0.5rem;
        text-align: left;
        border-bottom: 1px solid var(--border-color);
    }
    
    th {
        font-weight: 600;
        color: var(--text-muted);
    }
    
    .project-list {
        margin-top: 1rem;
    }
    
    .project-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    
    .project-item:last-child {
        border-bottom: none;
    }
    
    .project-title {
        font-weight: 500;
        flex: 1;
    }
    
    .project-hours {
        color: var(--primary);
        font-weight: 600;
        margin-left: 1rem;
    }
    
    .project-tasks {
        color: var(--text-muted);
        margin-left: 1rem;
        min-width: 60px;
        text-align: right;
    }
    
    .streaks-card {
        text-align: center;
    }
    
    .streak-display {
        margin: 1.5rem 0;
    }
    
    .streak-number {
        font-size: 3rem;
        font-weight: 700;
        color: var(--primary);
        display: block;
        line-height: 1;
    }
    
    .streak-label {
        font-size: 1rem;
        color: var(--text-muted);
        display: block;
        margin-top: 0.5rem;
    }
    
    .calibration-chart {
        margin-top: 1rem;
    }
    
    .calibration-header {
        display: flex;
        justify-content: space-between;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-bottom: 0.5rem;
    }
    
    .calibration-row {
        display: flex;
        align-items: center;
        margin-bottom: 0.5rem;
    }
    
    .week-label {
        width: 100px;
        font-size: 0.75rem;
        color: var(--text-muted);
    }
    
    .bar-container {
        flex: 1;
        height: 20px;
        background: var(--border-color);
        border-radius: 4px;
        overflow: hidden;
        display: flex;
    }
    
    .bar {
        height: 100%;
        transition: width 0.3s ease;
    }
    
    .priority-bar {
        background: var(--primary);
        opacity: 0.7;
    }
    
    .difficulty-bar {
        background: var(--danger);
        opacity: 0.7;
    }
    
    .values {
        width: 60px;
        text-align: right;
        font-size: 0.75rem;
        color: var(--text-muted);
        margin-left: 0.5rem;
    }
    
    .team-stats {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 1rem;
        margin: 1rem 0;
    }
    
    .blocked-list {
        margin-top: 1rem;
    }
    
    .blocked-item {
        display: flex;
        justify-content: space-between;
        padding: 0.5rem 0;
        border-bottom: 1px solid var(--border-color);
    }
    
    .blocked-item:last-child {
        border-bottom: none;
    }
    
    .task-title {
        font-weight: 500;
        flex: 1;
    }
    
    .blocked-since {
        color: var(--text-muted);
        font-size: 0.875rem;
    }
    
    .text-danger {
        color: var(--danger);
    }
    
    .text-success {
        color: var(--success);
    }
    
    .text-muted {
        color: var(--text-muted);
        font-size: 0.875rem;
    }
</style>