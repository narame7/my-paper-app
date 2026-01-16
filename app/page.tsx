'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function PaperManager() {
  const [doi, setDoi] = useState('');
  const [papers, setPapers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchSavedPapers();
  }, []);

  const fetchSavedPapers = async () => {
    const { data } = await supabase.from('papers').select('*').order('created_at', { ascending: false });
    if (data) setPapers(data);
  };

  // --- 삭제 함수 추가 ---
  const deletePaper = async (id: number) => {
    if (!confirm('이 논문을 목록에서 삭제하시겠습니까?')) return;

    const { error } = await supabase
      .from('papers')
      .delete()
      .eq('id', id); // DB의 id 값을 기준으로 삭제

    if (error) {
      alert('삭제 중 오류가 발생했습니다.');
    } else {
      // 화면 목록에서 즉시 제거
      setPapers(papers.filter(p => p.id !== id));
    }
  };

  const addPaper = async () => {
    if (!doi) return alert('DOI를 입력하세요!');
    setLoading(true);

    try {
      const res = await fetch(`https://api.crossref.org/works/${doi}`);
      const data = await res.json();
      
      // 2. CrossRef 데이터 추출
      const info = data.message;
      const issnList = info.ISSN || []; // 보통 [p-ISSN, e-ISSN] 형태로 들어옵니다.

      console.log("CrossRef에서 받은 ISSN 리스트:", issnList);

      // 3. Supabase JCR 테이블 조회 (Rank 정보 포함)
      const { data: jcrRows } = await supabase
        .from('jcr_impact_factors')
        .select('"IF", "Journal Title", "Rank", "Number of same category"')
        .in('ISSN', issnList)
        .order('IF', { ascending: false })
        .limit(1);

      const jcrData = jcrRows?.[0];

      // 상위 % 계산 (소수점 첫째 자리까지)
      let percentileStr = 'N/A';
      if (jcrData?.Rank && jcrData?.['Number of same category']) {
        const calc = (jcrData.Rank / jcrData['Number of same category']) * 100;
        percentileStr = `${calc.toFixed(1)}%`;
      }

      const newPaper = {
        doi,
        title: info.title[0],
        journal: jcrData?.['Journal Title'] || info['container-title'][0],
        year: info.created['date-parts'][0][0],
        impact_factor: jcrData?.IF ? jcrData.IF.toFixed(3) : 'N/A',
        percentile: percentileStr // 계산된 백분율 저장
      };

      const { data: savedData, error } = await supabase
        .from('papers')
        .insert([newPaper])
        .select(); // 저장된 행의 id를 받아오기 위해 추가

      if (error) throw error;

      alert('성공적으로 등록되었습니다!');
      setDoi('');
      if (savedData) setPapers([savedData[0], ...papers]);
    } catch (err) {
      console.error(err);
      alert('정보를 가져오는 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="p-10 max-w-5xl mx-auto text-black">
      <h1 className="text-3xl font-bold mb-8">CIDA Lab 연구성과 관리</h1>
      
      <div className="flex gap-2 mb-10">
        <input 
          className="flex-1 border p-3 rounded"
          placeholder="DOI를 입력하세요"
          value={doi}
          onChange={(e) => setDoi(e.target.value)}
        />
        <button onClick={addPaper} disabled={loading} className="bg-blue-600 text-white px-8 py-3 rounded font-bold">
          {loading ? '처리 중...' : '등록'}
        </button>
      </div>

      <div className="border rounded-lg overflow-hidden bg-white">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="p-4 text-center">연도</th>
              <th className="p-4">논문 정보</th>
              <th className="p-4 text-center">IF</th>
              <th className="p-4 text-center">상위 %</th>
              <th className="p-4 text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="p-4 text-center text-sm">{p.year}</td>
                <td className="p-4">
                  <div className="font-semibold text-sm line-clamp-1">{p.title}</div>
                  <div className="text-xs text-gray-500">{p.journal}</div>
                </td>
                <td className="p-4 text-center text-blue-600 font-bold">{p.impact_factor}</td>
                <td className="p-4 text-center">
                  {/* 상위 10% 이내면 강조 표시 */}
                  <span className={`px-2 py-1 rounded-full text-xs font-bold ${
                    parseFloat(p.percentile) <= 10 ? 'bg-red-100 text-red-600' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {p.percentile}
                  </span>
                </td>
                <td className="p-4 text-center">
                  <button 
                    onClick={() => deletePaper(p.id)}
                    className="text-red-500 hover:text-red-700 text-sm font-medium border border-red-200 px-2 py-1 rounded hover:bg-red-50"
                  >
                    삭제
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}