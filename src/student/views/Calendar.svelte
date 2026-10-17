<script>
    import { priorityList, completedList, view, activeDetailId } from '$lib/stores';
    import { calculateUrgency, parseDateLocal } from '$lib/utils/date';

    let currentDate = new Date();
    let currentMonth = currentDate.getMonth(); // 0 to 11
    let currentYear = currentDate.getFullYear();

    $: allItems = [...$priorityList, ...$completedList];
    
    // Derived groups
    $: undatedItems = allItems.filter(item => !item.deadline);
    $: datedItems = allItems.filter(item => item.deadline);

    // Date calculations
    $: daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
    $: startDay = new Date(currentYear, currentMonth, 1).getDay(); // 0 (Sun) to 6 (Sat)
    
    $: daysArray = Array.from({ length: daysInMonth }, (_, i) => {
        const d = i + 1;
        // Format to YYYY-MM-DD local logic
        const dateString = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        
        const itemsThisDay = datedItems.filter(item => {
            const itemDate = parseDateLocal(item.deadline);
            // parseDateLocal handles YYYY-MM-DD as local midnight
            // We'll normalize both
            return itemDate.getFullYear() === currentYear &&
                   itemDate.getMonth() === currentMonth &&
                   itemDate.getDate() === d;
        });

        // Determine if it's today
        const isToday = new Date().getFullYear() === currentYear &&
                        new Date().getMonth() === currentMonth &&
                        new Date().getDate() === d;
        
        return {
            date: d,
            isToday,
            items: itemsThisDay,
            dateString
        };
    });

    $: blanksArray = Array.from({ length: startDay }, (_, i) => i);

    function nextMonth() {
        if (currentMonth === 11) {
            currentMonth = 0;
            currentYear++;
        } else {
            currentMonth++;
        }
    }

    function prevMonth() {
        if (currentMonth === 0) {
            currentMonth = 11;
            currentYear--;
        } else {
            currentMonth--;
        }
    }

    function goToday() {
        const now = new Date();
        currentMonth = now.getMonth();
        currentYear = now.getFullYear();
    }

    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

    function openDetail(item) {
        activeDetailId.set({ id: item.id, type: item.entityType });
        view.set('detail');
    }
</script>

<div class="calendar-layout fade-in">
    <!-- Main Calendar Area -->
    <div class="calendar-main">
        <header class="calendar-header mb-4 flex items-center justify-between">
            <div class="flex items-center gap-4">
                <h2 class="m-0">{monthNames[currentMonth]} {currentYear}</h2>
                <button class="btn btn-sm" on:click={goToday}>Today</button>
            </div>
            <div class="flex gap-2">
                <button class="btn btn-sm" on:click={prevMonth}>&larr; Prev</button>
                <button class="btn btn-sm" on:click={nextMonth}>Next &rarr;</button>
            </div>
        </header>

        <div class="calendar-grid">
            {#each dayNames as day}
                <div class="grid-header text-center font-bold text-muted text-sm">{day}</div>
            {/each}

            {#each blanksArray as blank}
                <div class="grid-cell empty"></div>
            {/each}

            {#each daysArray as dayObj}
                <div class="grid-cell {dayObj.isToday ? 'today' : ''}">
                    <div class="date-number">{dayObj.date}</div>
                    <div class="chips-container">
                        {#each dayObj.items as item}
                            {@const isCompleted = item.status === 'done'}
                            {@const urg = calculateUrgency(item.deadline)}
                            {@const isOverdue = urg === 'Overdue' && !isCompleted}
                            
                            <!-- svelte-ignore a11y-click-events-have-key-events -->
                            <div class="item-chip {isCompleted ? 'completed' : ''} {isOverdue ? 'overdue' : ''} {item.entityType === 'task' ? 'task-chip' : 'assignment-chip'}"
                                 role="button"
                                 tabindex="0"
                                 on:click={() => openDetail(item)}>
                                {item.title}
                            </div>
                        {/each}
                    </div>
                </div>
            {/each}
        </div>
    </div>

    <!-- Sidebar for Undated Items -->
    <aside class="calendar-sidebar">
        <h3 class="sidebar-title">Undated Priority</h3>
        {#if undatedItems.length === 0}
            <p class="text-sm text-muted empty-msg">No undated items.</p>
        {:else}
            <div class="undated-list mt-3">
                {#each undatedItems as item}
                    {@const isCompleted = item.status === 'done'}
                    <!-- svelte-ignore a11y-click-events-have-key-events -->
                    <div class="undated-card {isCompleted ? 'completed' : ''}"
                         role="button"
                         tabindex="0"
                         on:click={() => openDetail(item)}>
                        <div class="text-xs text-muted">
                            {item.entityType === 'task' ? 'Task' : 'Assignment'}
                        </div>
                        <div class="undated-title font-bold text-sm">
                            {item.title}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </aside>
</div>

<style>
    .calendar-layout {
        display: flex;
        gap: var(--space-6);
        height: calc(100vh - 120px);
        align-items: flex-start;
    }

    .calendar-main {
        flex: 1;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        box-shadow: var(--shadow-sm);
        padding: var(--space-6);
        display: flex;
        flex-direction: column;
        min-height: 100%;
        overflow: hidden;
    }

    .calendar-sidebar {
        width: 300px;
        background: var(--surface-color);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        box-shadow: var(--shadow-sm);
        padding: var(--space-6);
        display: flex;
        flex-direction: column;
        max-height: 100%;
        overflow-y: auto;
    }

    .sidebar-title {
        margin: 0;
        font-size: var(--fs-lg);
        border-bottom: 1px solid var(--border-color);
        padding-bottom: var(--space-2);
    }

    .empty-msg {
        margin-top: var(--space-4);
    }

    .calendar-grid {
        display: grid;
        grid-template-columns: repeat(7, 1fr);
        grid-auto-rows: minmax(100px, 1fr);
        gap: 1px;
        background: var(--border-color);
        border: 1px solid var(--border-color);
        flex: 1;
        border-radius: var(--radius);
        overflow: hidden;
    }

    .grid-header {
        background: var(--bg-subtle);
        padding: var(--space-2);
    }

    .grid-cell {
        background: var(--surface-color);
        padding: var(--space-2);
        display: flex;
        flex-direction: column;
        overflow: hidden;
    }

    .grid-cell.empty {
        background: var(--bg-subtle);
    }

    .grid-cell.today {
        background: var(--bg-subtle);
    }

    .grid-cell.today .date-number {
        background: var(--primary);
        color: var(--text-on-primary);
        border-radius: var(--radius-full);
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-weight: 700;
    }

    .date-number {
        font-size: var(--fs-sm);
        color: var(--text-muted);
        margin-bottom: var(--space-2);
        align-self: flex-start;
    }

    .chips-container {
        display: flex;
        flex-direction: column;
        gap: var(--space-1);
        overflow-y: auto;
        padding-right: 2px;
    }

    .chips-container::-webkit-scrollbar {
        width: 4px;
    }
    .chips-container::-webkit-scrollbar-thumb {
        background: var(--border-color);
        border-radius: var(--radius-xs);
    }

    .item-chip {
        font-size: var(--fs-xs);
        padding: 2px var(--space-2);
        border-radius: var(--radius-xs);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        cursor: pointer;
        transition: opacity var(--transition-fast);
    }

    .item-chip:hover {
        opacity: 0.8;
    }

    .assignment-chip {
        background: rgba(var(--primary-rgb), 0.15);
        color: var(--primary);
        border: 1px solid rgba(var(--primary-rgb), 0.3);
    }

    .task-chip {
        background: var(--bg-subtle);
        color: var(--text-main);
        border: 1px solid var(--border-color);
    }

    .item-chip.overdue {
        background: var(--danger-surface);
        color: var(--danger);
        border: 1px solid var(--danger);
        font-weight: 700;
    }

    .item-chip.completed {
        text-decoration: line-through;
        opacity: 0.5;
        background: transparent;
        border: 1px solid var(--border-color);
        color: var(--text-muted);
    }

    .undated-card {
        padding: var(--space-3);
        border: 1px solid var(--border-color);
        border-radius: var(--radius);
        background: var(--bg-subtle);
        margin-bottom: var(--space-2);
        cursor: pointer;
        transition: transform var(--transition), box-shadow var(--transition);
    }

    .undated-card:hover {
        transform: translateY(-1px);
        box-shadow: var(--shadow-sm);
    }

    .undated-card.completed {
        opacity: 0.5;
        text-decoration: line-through;
    }

    @media (max-width: 768px) {
        .calendar-layout {
            flex-direction: column;
            overflow: auto;
        }
        .calendar-sidebar {
            width: 100%;
        }
        .calendar-main {
            min-height: 500px;
        }
    }
</style>
