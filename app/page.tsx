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
      
      // 2. CrossRef 데이터 추출 및 숫자만 추출
      const info = data.message;
      const rawIssn = info.ISSN ? info.ISSN[0] : null;

      // ISSN에서 숫자 8자리만 추출 (예: 1234-5678 -> 12345678)
      const digitsOnly = rawIssn ? rawIssn.replace(/[^0-9X]/gi, '') : '';

      // 3. Supabase JCR 테이블 조회 (유연한 검색 방식)
      const { data: jcrRows, error: jcrError } = await supabase
        .from('jcr_impact_factors')
        .select('"IF", "Journal Title", "ISSN"')
        // .ilike를 사용하여 하이픈 유무와 상관없이 숫자 패턴이 포함되어 있는지 확인
        .ilike('ISSN', `%${digitsOnly.slice(0, 4)}%${digitsOnly.slice(4)}%`) 
        .order('IF', { ascending: false })
        .limit(1);

      console.log("시도한 숫자 패턴:", digitsOnly);
      console.log("매칭된 최종 JCR 데이터:", jcrRows?.[0] || '데이터 없음');

      const jcrData = jcrRows && jcrRows.length > 0 ? jcrRows[0] : null;

      const newPaper = {
        doi,
        title: info.title[0],
        journal: jcrData?.['Journal Title'] || info['container-title'][0],
        year: info.created['date-parts'][0][0],
        impact_factor: jcrData?.IF ? jcrData.IF.toFixed(3) : 'N/A'
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
              <th className="p-4">연도</th>
              <th className="p-4">논문 제목</th>
              <th className="p-4">IF</th>
              <th className="p-4 text-center">관리</th>
            </tr>
          </thead>
          <tbody>
            {papers.map((p) => (
              <tr key={p.id} className="border-b hover:bg-gray-50">
                <td className="p-4">{p.year}</td>
                <td className="p-4">
                  <div className="font-semibold">{p.title}</div>
                  <div className="text-sm text-gray-500">{p.journal}</div>
                </td>
                <td className="p-4 text-blue-600 font-bold">{p.impact_factor}</td>
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