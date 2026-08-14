/**
 * Sections Page — placeholder (shared by Dean and Program Head via alias)
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
                    <path stroke-linecap="round" stroke-linejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"/>
                </svg>
            </div>
            <h2>Coming Soon</h2>
            <p>Oversee Sections is being reworked. Check back later.</p>
        </div>
    `;
}
