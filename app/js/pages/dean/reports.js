/**
 * Reports Page — placeholder
 */
export async function render(container) {
    container.innerHTML = `
        <style>
            .rp-soon {
                display: flex; flex-direction: column; align-items: center; justify-content: center;
                text-align: center; padding: 100px 20px; min-height: 400px;
            }
            .rp-soon-icon {
                width: 72px; height: 72px; border-radius: 20px;
                background: #E8F5E9; color: #1B4D3E;
                display: flex; align-items: center; justify-content: center;
                margin-bottom: 20px;
            }
            .rp-soon h2 { margin: 0 0 8px; font-size: 22px; font-weight: 800; color: #1f2937; }
            .rp-soon p { margin: 0; font-size: 14px; color: #6b7280; max-width: 360px; }
        </style>
        <div class="rp-soon">
            <div class="rp-soon-icon">
                <svg width="32" height="32" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                    <path stroke-linecap="round" stroke-linejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"/>
                </svg>
            </div>
            <h2>Coming Soon</h2>
            <p>Reports are being reworked. Check back later.</p>
        </div>
    `;
}
